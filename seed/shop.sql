-- Références relevées dans l'ancienne boutique du club. Les INSERT OR IGNORE
-- permettent de relancer ce fichier sans écraser les modifications de l'admin.
INSERT OR IGNORE INTO shop_categories(slug,name,description,display_order) VALUES
('joueur','Pour jouer','Les essentiels pour les entraînements et les matchs.',10),
('vestiaire','Avant & après-match','Vestes, sweats et vêtements chauds aux couleurs du club.',20),
('supporter','Pour supporter','De quoi porter les couleurs du FCE au stade et au quotidien.',30),
('sacs-accessoires','Sacs & accessoires','Pour transporter son équipement et compléter sa tenue.',40);

INSERT OR IGNORE INTO shop_products(
  shop_category_id,slug,name,short_description,price_label,price_details,sizes,options,featured,highlighted,display_order
) VALUES
((SELECT id FROM shop_categories WHERE slug='joueur'),'training-pant-salci','Training Pant Salci noir','Pantalon d’entraînement noir.','Dès 18 €','Enfant : 18 € | Adulte : 21 €','Enfant : 4 à 14 ans | Adulte : S à 4XL','Initiales : +1,50 €',0,1,10),
((SELECT id FROM shop_categories WHERE slug='vestiaire'),'veste-capuche-tortona','Veste à capuche Tortona noire','Veste zippée à capuche.','Dès 40 €','Enfant : 40 € | Adulte : 43 €','Enfant : 6 à 14 ans | Adulte : S à 4XL','Initiales : +1,50 €',0,1,20),
((SELECT id FROM shop_categories WHERE slug='joueur'),'sweat-training-trieste','Sweat training Trieste noir','Sweat technique pour l’entraînement.','Dès 32 €','Enfant : 32 € | Adulte : 35 €','Enfant : 6 à 14 ans | Adulte : S à XL','Initiales : +1,50 €',0,1,30),
((SELECT id FROM shop_categories WHERE slug='vestiaire'),'sweat-capuche-accio','Sweat à capuche homme Accio','Sweat à capuche coupe homme.','Dès 37,50 €','Enfant : 37,50 € | Adulte : 40 €','Enfant : 6 à 14 ans | Adulte : S à 4XL','Initiales : +1,50 €',0,0,40),
((SELECT id FROM shop_categories WHERE slug='vestiaire'),'sweat-capuche-accia','Sweat à capuche femme Accia','Sweat à capuche coupe femme.','37,50 €','Femme : 37,50 €','2XS à 2XL','Initiales : +1,50 €',0,0,50),
((SELECT id FROM shop_categories WHERE slug='vestiaire'),'veste-odolon','Veste Odolon','Veste chaude du club.','77,50 €','Adulte : 77,50 €','S à 4XL','Initiales : +1,50 €',0,0,60),
((SELECT id FROM shop_categories WHERE slug='vestiaire'),'doudoune-lamezio','Doudoune Lamezio noire et grise','Doudoune chaude aux couleurs du FCE.','Dès 65,50 €','Enfant : 65,50 € | Adulte : 69,50 €','Enfant : 6 à 14 ans | Adulte : S à 4XL','Initiales : +1,50 €',0,1,70),
((SELECT id FROM shop_categories WHERE slug='joueur'),'coupe-vent-martio','Coupe-vent Martio noir','Coupe-vent adulte pour le bord du terrain.','35 €','Adulte : 35 €','S à 4XL','Initiales : +1,50 €',0,0,80),
((SELECT id FROM shop_categories WHERE slug='joueur'),'coupe-vent-wister','Coupe-vent Wister noir','Coupe-vent enfant.','24 €','Enfant : 24 €','6 à 14 ans','Initiales : +1,50 €',0,0,90),
((SELECT id FROM shop_categories WHERE slug='sacs-accessoires'),'sac-brenno','Sac Brenno noir','Sac de sport pour l’équipement.','27 €','Prix indicatif : 27 €','','Initiales : +1,50 €',0,1,100),
((SELECT id FROM shop_categories WHERE slug='sacs-accessoires'),'sac-a-dos-velia','Sac à dos Velia noir','Sac à dos compact du club.','20,50 €','Prix indicatif : 20,50 €','','Initiales : +1,50 €',0,0,110),
((SELECT id FROM shop_categories WHERE slug='sacs-accessoires'),'sac-a-dos-backpack','Sac à dos Backpack noir','Sac à dos grand format.','29,50 €','Prix indicatif : 29,50 €','','Initiales : +1,50 €',0,0,120),
((SELECT id FROM shop_categories WHERE slug='supporter'),'bonnet-atten-3','Bonnet Atten 3 noir','Bonnet chaud aux couleurs du club.','18 €','Prix indicatif : 18 €','','',0,0,130),
((SELECT id FROM shop_categories WHERE slug='supporter'),'tee-shirt-castolo','Tee-shirt Castolo bordeaux','Le tee-shirt bordeaux pour porter les couleurs du FCE.','Dès 20 €','Enfant : 20 € | Adulte : 23 €','Enfant : 6/8, 10/12, 14 ans | Adulte : S/M, L/XL, 2XL, 3XL','Initiales : +1,50 €',1,1,140),
((SELECT id FROM shop_categories WHERE slug='joueur'),'short-paggo','Short Paggo bordeaux','Short léger aux couleurs du club.','Dès 13 €','Enfant : 13 € | Adulte : 14,50 €','Enfant : 6/8, 10/12, 14 ans | Adulte : S/M, L/XL, 2XL, 3XL','',0,0,150),
((SELECT id FROM shop_categories WHERE slug='supporter'),'casquette-bapov','Casquette Bapov noire','Casquette noire du club.','22 €','Prix indicatif : 22 €','','',0,1,160),
((SELECT id FROM shop_categories WHERE slug='joueur'),'chaussettes-penao','Chaussettes Penao bordeaux','Chaussettes de football bordeaux.','6,70 €','Prix indicatif : 6,70 €','23/26 à 47/49','',0,0,170);
