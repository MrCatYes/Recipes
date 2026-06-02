DELETE FROM "Price" WHERE source = 'flyer';
DELETE FROM "StoreProduct" WHERE sku LIKE 'flyer-%';
DELETE FROM "FlyerItem";
