import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db';
import { computeMealPlan, generateListFromPlan } from '../services/meal-plan.service';
import type { MealPlanSummary } from '@epicerie/shared-types';

export async function mealPlanRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.authenticate };

  async function ownedPlan(planId: string, userId: string) {
    const plan = await prisma.mealPlan.findUnique({ where: { id: planId } });
    return plan && plan.userId === userId ? plan : null;
  }

  // GET /meal-plans
  app.get('/meal-plans', auth, async (req) => {
    const plans = await prisma.mealPlan.findMany({
      where: { userId: req.user.sub },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { entries: true } } },
    });
    return {
      plans: plans.map((p): MealPlanSummary => ({
        id: p.id,
        name: p.name,
        weekOf: p.weekOf?.toISOString() ?? null,
        budgetCents: p.budgetCents,
        recipeCount: p._count.entries,
        updatedAt: p.updatedAt.toISOString(),
      })),
    };
  });

  // POST /meal-plans  { name?, weekOf?, budgetCents? }
  app.post('/meal-plans', auth, async (req, reply) => {
    const schema = z.object({
      name: z.string().min(1).max(80).optional(),
      weekOf: z.string().datetime().optional(),
      budgetCents: z.number().int().positive().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest(parsed.error.errors[0]?.message ?? 'Invalide');
    const plan = await prisma.mealPlan.create({
      data: {
        userId: req.user.sub,
        name: parsed.data.name ?? 'Ma semaine',
        weekOf: parsed.data.weekOf ? new Date(parsed.data.weekOf) : null,
        budgetCents: parsed.data.budgetCents ?? null,
      },
    });
    return reply.code(201).send(await computeMealPlan(plan.id));
  });

  // GET /meal-plans/:id
  app.get<{ Params: { id: string } }>('/meal-plans/:id', auth, async (req, reply) => {
    if (!(await ownedPlan(req.params.id, req.user.sub))) return reply.notFound('Plan introuvable');
    return computeMealPlan(req.params.id);
  });

  // PATCH /meal-plans/:id  { name?, weekOf?, budgetCents? }
  app.patch<{ Params: { id: string } }>('/meal-plans/:id', auth, async (req, reply) => {
    if (!(await ownedPlan(req.params.id, req.user.sub))) return reply.notFound('Plan introuvable');
    const schema = z.object({
      name: z.string().min(1).max(80).optional(),
      weekOf: z.string().datetime().nullable().optional(),
      budgetCents: z.number().int().positive().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest('Invalide');
    const { weekOf, ...rest } = parsed.data;
    await prisma.mealPlan.update({
      where: { id: req.params.id },
      data: { ...rest, ...(weekOf !== undefined ? { weekOf: weekOf ? new Date(weekOf) : null } : {}) },
    });
    return computeMealPlan(req.params.id);
  });

  // DELETE /meal-plans/:id
  app.delete<{ Params: { id: string } }>('/meal-plans/:id', auth, async (req, reply) => {
    if (!(await ownedPlan(req.params.id, req.user.sub))) return reply.notFound('Plan introuvable');
    await prisma.mealPlan.delete({ where: { id: req.params.id } });
    return reply.code(204).send();
  });

  // POST /meal-plans/:id/recipes  { recipeId, servings?, dayOfWeek? }
  app.post<{ Params: { id: string } }>('/meal-plans/:id/recipes', auth, async (req, reply) => {
    if (!(await ownedPlan(req.params.id, req.user.sub))) return reply.notFound('Plan introuvable');
    const schema = z.object({
      recipeId: z.string().min(1),
      servings: z.number().int().min(1).max(50).optional(),
      dayOfWeek: z.number().int().min(0).max(6).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest('Invalide');

    const recipe = await prisma.recipe.findUnique({ where: { id: parsed.data.recipeId }, select: { servings: true } });
    if (!recipe) return reply.notFound('Recette introuvable');

    const max = await prisma.mealPlanEntry.aggregate({ where: { planId: req.params.id }, _max: { sortOrder: true } });
    await prisma.mealPlanEntry.create({
      data: {
        planId: req.params.id,
        recipeId: parsed.data.recipeId,
        servings: parsed.data.servings ?? recipe.servings,
        dayOfWeek: parsed.data.dayOfWeek ?? null,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
    await prisma.mealPlan.update({ where: { id: req.params.id }, data: { updatedAt: new Date() } });
    return reply.code(201).send(await computeMealPlan(req.params.id));
  });

  // PATCH /meal-plans/:id/recipes/:entryId  { servings?, dayOfWeek? }
  app.patch<{ Params: { id: string; entryId: string } }>('/meal-plans/:id/recipes/:entryId', auth, async (req, reply) => {
    if (!(await ownedPlan(req.params.id, req.user.sub))) return reply.notFound('Plan introuvable');
    const schema = z.object({
      servings: z.number().int().min(1).max(50).optional(),
      dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.badRequest('Invalide');
    const entry = await prisma.mealPlanEntry.findUnique({ where: { id: req.params.entryId } });
    if (!entry || entry.planId !== req.params.id) return reply.notFound('Entrée introuvable');
    await prisma.mealPlanEntry.update({ where: { id: req.params.entryId }, data: parsed.data });
    return computeMealPlan(req.params.id);
  });

  // DELETE /meal-plans/:id/recipes/:entryId
  app.delete<{ Params: { id: string; entryId: string } }>('/meal-plans/:id/recipes/:entryId', auth, async (req, reply) => {
    if (!(await ownedPlan(req.params.id, req.user.sub))) return reply.notFound('Plan introuvable');
    const entry = await prisma.mealPlanEntry.findUnique({ where: { id: req.params.entryId } });
    if (!entry || entry.planId !== req.params.id) return reply.notFound('Entrée introuvable');
    await prisma.mealPlanEntry.delete({ where: { id: req.params.entryId } });
    return computeMealPlan(req.params.id);
  });

  // POST /meal-plans/:id/generate-list  → build a shopping list from the plan
  app.post<{ Params: { id: string } }>('/meal-plans/:id/generate-list', auth, async (req, reply) => {
    if (!(await ownedPlan(req.params.id, req.user.sub))) return reply.notFound('Plan introuvable');
    const list = await generateListFromPlan(req.params.id, req.user.sub);
    if (!list) return reply.internalServerError('Échec génération de la liste');
    return reply.code(201).send(list);
  });
}
