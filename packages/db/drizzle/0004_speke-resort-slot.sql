INSERT INTO "billboard_slots" ("id", "name", "lat", "lng", "tier") VALUES
  ('slot-speke-roundabout', 'Speke Resort Roundabout', 0.2373, 32.6254, 'standard')
ON CONFLICT ("id") DO NOTHING;
