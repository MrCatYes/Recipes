import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db';
import { computeListCost, addRecipeToList } from '../services/shopping-list.service';
import type { ShoppingListSummary } from '@epicerie/shared-types';

export async function shoppingListRoutes(app: FastifyInstance) {
  // All routes require auth.
  const auth = { preHandler: app.authenticate };

  /** Load a list only if it belongs to the caller. Returns null otherwise. */
  async function ownedList(listId: string, userId: string) {
    const list = await prisma.shoppingList.findUnique({ where: { id: listId } });
    return list && list.userId === userId ? list : null;
  }

  // GET /lists  → caller's lists (summaries)
  app.get('/lists', auth, async (req) => {
    const lists = await prisma.shoppingList.findMany({
      where: { userId: req.user.sub },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { items: true } }, items: { where: { checked: true }, select: { id: true } } },
    });
    return {
      lists: lists.map((l): ShoppingListSummary => ({
        id: l.id,
        name: l.name,
        itemCount: l._count.items,
        checkedCount: l.items.length,
        updatedAt: l.updatedAt.toISOString(),
      })),
    };
  });

  // POST /lists  { name? }
  app.post('/lists', auth, async (req, reply) => {
    const schema = z.object({ name: z.string().min(1).max(80).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest('Nom invalide');
    const list = await prisma.shoppingList.create({
      data: { userId: req.user.sub, name: parsed.data.name ?? 'Ma liste' },
    });
    return reply.code(201).send(await computeListCost(list.id));
  });

  // GET /lists/:id  → full list with costs
  app.get<{ Params: { id: string } }>('/lists/:id', auth, async (req, reply) => {
    if (!(await ownedList(req.params.id, req.user.sub))) return reply.notFound('Liste introuvable');
    return computeListCost(req.params.id);
  });

  // PATCH /lists/:id  { name }
  app.patch<{ Params: { id: string } }>('/lists/:id', auth, async (req, reply) => {
    if (!(await ownedList(req.params.id, req.user.sub))) return reply.notFound('Liste introuvable');
    const schema = z.object({ name: z.string().min(1).max(80) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest('Nom invalide');
    await prisma.shoppingList.update({ where: { id: req.params.id }, data: { name: parsed.data.name } });
    return computeListCost(req.params.id);
  });

  // DELETE /lists/:id
  app.delete<{ Params: { id: string } }>('/lists/:id', auth, async (req, reply) => {
    if (!(await ownedList(req.params.id, req.user.sub))) return reply.notFound('Liste introuvable');
    await prisma.shoppingList.delete({ where: { id: req.params.id } });
    return reply.code(204).send();
  });

  // POST /lists/:id/items  { rawText, productId?, quantity?, unit?, category? }
  app.post<{ Params: { id: string } }>('/lists/:id/items', auth, async (req, reply) => {
    if (!(await ownedList(req.params.id, req.user.sub))) return reply.notFound('Liste introuvable');
    const schema = z.object({
      rawText: z.string().min(1).max(200),
      productId: z.string().optional(),
      quantity: z.number().positive().optional(),
      unit: z.string().min(1).max(20).optional(),
      category: z.string().max(60).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.errors[0]?.message ?? 'Invalide');

    // Validate productId if given; pull its category as a default aisle
    let category = parsed.data.category ?? null;
    if (parsed.data.productId) {
      const prod = await prisma.product.findUnique({ where: { id: parsed.data.productId }, select: { category: true } });
      if (!prod) return reply.badRequest('Produit introuvable');
      category ??= prod.category;
    }

    const max = await prisma.shoppingListItem.aggregate({ where: { listId: req.params.id }, _max: { sortOrder: true } });
    await prisma.shoppingListItem.create({
      data: {
        listId: req.params.id,
        rawText: parsed.data.rawText,
        productId: parsed.data.productId ?? null,
        quantity: parsed.data.quantity ?? null,
        unit: parsed.data.unit ?? null,
        category,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
    await prisma.shoppingList.update({ where: { id: req.params.id }, data: { updatedAt: new Date() } });
    return reply.code(201).send(await computeListCost(req.params.id));
  });

  // PATCH /lists/:id/items/:itemId  { checked?, quantity?, unit?, rawText?, category?, sortOrder? }
  app.patch<{ Params: { id: string; itemId: string } }>('/lists/:id/items/:itemId', auth, async (req, reply) => {
    if (!(await ownedList(req.params.id, req.user.sub))) return reply.notFound('Liste introuvable');
    const schema = z.object({
      checked: z.boolean().optional(),
      quantity: z.number().positive().nullable().optional(),
      unit: z.string().min(1).max(20).nullable().optional(),
      rawText: z.string().min(1).max(200).optional(),
      category: z.string().max(60).nullable().optional(),
      sortOrder: z.number().int().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest('Invalide');

    const item = await prisma.shoppingListItem.findUnique({ where: { id: req.params.itemId } });
    if (!item || item.listId !== req.params.id) return reply.notFound('Article introuvable');

    await prisma.shoppingListItem.update({ where: { id: req.params.itemId }, data: parsed.data });
    return computeListCost(req.params.id);
  });

  // DELETE /lists/:id/items/:itemId
  app.delete<{ Params: { id: string; itemId: string } }>('/lists/:id/items/:itemId', auth, async (req, reply) => {
    if (!(await ownedList(req.params.id, req.user.sub))) return reply.notFound('Liste introuvable');
    const item = await prisma.shoppingListItem.findUnique({ where: { id: req.params.itemId } });
    if (!item || item.listId !== req.params.id) return reply.notFound('Article introuvable');
    await prisma.shoppingListItem.delete({ where: { id: req.params.itemId } });
    return computeListCost(req.params.id);
  });

  // POST /lists/:id/add-recipe  { recipeId }  → add recipe ingredients
  app.post<{ Params: { id: string } }>('/lists/:id/add-recipe', auth, async (req, reply) => {
    if (!(await ownedList(req.params.id, req.user.sub))) return reply.notFound('Liste introuvable');
    const schema = z.object({ recipeId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest('recipeId requis');

    const added = await addRecipeToList(req.params.id, parsed.data.recipeId);
    if (added === 0) {
      const recipe = await prisma.recipe.findUnique({ where: { id: parsed.data.recipeId }, select: { id: true } });
      if (!recipe) return reply.notFound('Recette introuvable');
    }
    await prisma.shoppingList.update({ where: { id: req.params.id }, data: { updatedAt: new Date() } });
    const cost = await computeListCost(req.params.id);
    return reply.send({ added, list: cost });
  });
}
