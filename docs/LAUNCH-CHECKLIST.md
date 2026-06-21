# Checklist de lancement — [NOM DE L'APP]

État au [DATE]. Cases cochées = fait dans le repo actuel. Le reste = à faire avant publication + monétisation.

---

## 0. Bloqueur n°1 — Légitimité des données (à trancher AVANT de monétiser)

Le risque juridique augmente avec le revenu. Un app gratuit passe sous le radar ; un app payant bâti sur du scraping + clés tierces + marques = cible de mise en demeure / retrait des stores.

- [ ] Décider la stratégie de données :
  - [ ] **Crowdsourcing + OCR de reçus** (recommandé — l'utilisateur possède ses données)
  - [ ] **Flipp partner API** / programmes affiliés officiels
  - [ ] OU accepter le risque pour un soft-launch, en connaissance de cause
- [ ] Faire réviser le modèle de données par un·e juriste
- [ ] Documenter la provenance de chaque source de prix

---

## 1. Légal & conformité

- [x] Brouillon politique de confidentialité (`legal/politique-confidentialite.md`)
- [x] Brouillon CGU (`legal/conditions-utilisation.md`)
- [ ] **Révision juridique** des deux documents (Loi 25, LPRPDE, marques)
- [ ] Héberger les deux docs à une **URL publique** (requis par les stores)
- [ ] Incorporer une entité (Inc./SENC) pour limiter la responsabilité personnelle
- [ ] Nommer un·e responsable de la protection des renseignements (Loi 25)
- [ ] Évaluation des facteurs vie privée (ÉFVP) si données hors Québec

---

## 2. Technique — prêt pour la production

### Fait
- [x] Auth JWT (register/login/refresh/logout/me) + tokens rotatifs révocables
- [x] Géoloc magasins proches (haversine) + 303 magasins IGA réels
- [x] Catalogue IGA (~21k), Maxi, Metro, Super C
- [x] Comparateur, parsing recettes, coût/portion, difficulté
- [x] Listes de courses + planif repas/budget (P2)
- [x] 172 tests unitaires, typecheck propre

### À faire
- [ ] **Secrets hors code** : `JWT_SECRET` fort, clés LLM en gestionnaire de secrets (pas dans `.env` commité ni en dur)
- [ ] Migrations Prisma propres (arrêter `db push` en prod ; baseline + `migrate deploy`)
- [ ] Perf : cache des coûts de recettes/listes (Redis) — `computeRecipeCost` en boucle = N+1
- [ ] Rate limiting (`@fastify/rate-limit`) sur auth + endpoints publics
- [ ] CORS restreint au domaine de l'app (pas `origin: true` en prod)
- [ ] Suppression de compte in-app (DELETE /auth/me) — **exigé par Apple**
- [ ] Hébergement : API + Postgres gérés (Fly.io / Railway / Render) + sauvegardes auto
- [ ] Scrapers en worker cloud planifié (pas sur le poste dev) + monitoring du taux de succès
- [ ] Observabilité : Sentry (erreurs) + journaux + alertes
- [ ] Contrôle coût LLM : cache parsing, JSON-LD d'abord, quota par utilisateur

---

## 3. Mobile — prêt pour les stores

- [x] Auth context + stockage token sécurisé, écrans login/register
- [x] Sélection magasins par géoloc
- [ ] **Icône + splash réels** (actuellement placeholders 1×1) — 1024×1024
- [ ] Écrans listes + planif repas/budget (UI des features P2)
- [ ] Error boundaries + états vides/chargement soignés (skeletons)
- [ ] Onboarding (localisation, magasins, préférences) + proposition de valeur
- [ ] Bilingue FR/EN (FR prioritaire QC)
- [ ] Accessibilité (contraste, taille police, labels lecteur d'écran)
- [ ] Mode sombre
- [ ] Build de production via **EAS Build** (iOS + Android)

---

## 4. Comptes & frais

- [ ] Apple Developer Program — **99 USD/an**
- [ ] Google Play Developer — **25 USD une fois**
- [ ] Compte RevenueCat (gestion abonnements multiplateforme — gratuit au début)
- [ ] Nom de domaine (site + URLs légales)
- [ ] Compte Sentry / hébergeur (budget mensuel ~5–30 USD au départ)

---

## 5. Monétisation (Freemium)

- [ ] Définir le découpage Gratuit vs Pro
  - Gratuit : comparateur, recettes de base, 1 liste
  - **Pro (~3,99 $/mois ou 29,99 $/an)** : planif repas, optimiseur budget, alertes baisse de prix, garde-manger, listes illimitées, multi-magasins
- [ ] Intégrer RevenueCat + IAP (abonnements) iOS/Android
- [ ] Paywall + écran de gestion d'abonnement
- [ ] Restaurer les achats
- [ ] Tester les flux d'achat en sandbox

---

## 6. Fiche store (ASO)

- [ ] Nom + sous-titre optimisés (mots-clés : épicerie, économie, recettes, Québec)
- [ ] Description (FR + EN)
- [ ] Captures d'écran (téléphone + tablette) montrant le « vrai coût d'une recette »
- [ ] Vidéo de prévisualisation (optionnel mais efficace)
- [ ] Formulaire **Data Safety** (Play) + **App Privacy** (Apple) cohérents avec la politique
- [ ] Classification d'âge
- [ ] URLs : politique de confidentialité + support

---

## 7. Beta fermée

- [ ] **TestFlight** (iOS) — inviter 20–50 testeurs QC
- [ ] **Play Internal Testing** (Android)
- [ ] Recueillir retours : précision des prix, match d'ingrédients, valeur perçue
- [ ] Corriger les bogues bloquants + crashs
- [ ] Mesurer : % match ingrédients, fraîcheur prix, rétention J1/J7

---

## 8. Lancement

- [ ] Soumettre à l'App Store + Play (prévoir 1–3 jours de revue Apple)
- [ ] Soft-launch **Québec** d'abord
- [ ] Page d'accueil web + capture d'emails
- [ ] Canaux : r/Quebec, groupes Facebook frugaux/coupons, TikTok (« vrai coût d'une recette »), influenceurs bouffe QC

---

## 9. Post-lancement

- [ ] Suivre rétention + conversion gratuit→Pro avant de dépenser en acquisition
- [ ] Boucle de feedback in-app
- [ ] Itérer sur les features « wow » (alertes prix, OCR reçus)
- [ ] Surveiller marge : coût hébergement + LLM + scraping vs revenu abo

---

### Chemin critique vers le 1er dollar
1. Trancher la légitimité des données (§0)
2. UI mobile des features Pro (§3) + paywall RevenueCat (§5)
3. Suppression de compte in-app + secrets + hébergement (§2)
4. Docs légaux révisés + hébergés (§1)
5. Beta fermée → soumission → soft-launch QC (§7–8)
