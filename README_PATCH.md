# Patch ERP NYSOA — finances et tableau de bord

## Installation

Dans la racine du dépôt GitHub Pages `nysoa-erp`, remplacer les fichiers `app.js`, `styles.css` et `index.html` par ceux de cette archive. Publier ensuite la modification et actualiser la page sur Mac et téléphone (rechargement complet). Le domaine Firebase `erp-nysoa.firebaseapp.com` peut afficher « Site Not Found » : utiliser l'adresse GitHub Pages de l'ERP.

## Règles financières

- Les encaissements clients **validés** constituent une trésorerie générale commune. Une facture émise constitue le chiffre d'affaires mais n'augmente pas cette trésorerie avant paiement validé.
- Le budget du chantier est un plafond de suivi. Dès qu'un ou plusieurs devis de ce chantier sont acceptés, leur total final TTC après réduction négociée devient automatiquement le budget du chantier ; sans devis accepté, le budget saisi dans la fiche chantier reste la référence. Le budget ne constitue pas, à lui seul, un mouvement d'argent. Les dépenses payées par l'Admin et par la Caisse Gestionnaire diminuent toutes le budget restant du chantier auquel elles sont affectées.
- L'approvisionnement demandé ou simplement validé ne crédite pas la caisse. L'entrée de caisse réellement remise au gestionnaire est un transfert de trésorerie vers sa caisse, sans nouvelle dépense. Une dépense Gestionnaire diminue ensuite sa caisse ; un achat Admin payé diminue la trésorerie générale. Une dépense en attente ou un achat non payé n'est pas une sortie réelle.
- Formules : budget restant chantier = budget initial − dépenses réelles du chantier ; caisse gestionnaire = entrées manuelles − dépenses payées sur cette caisse ; trésorerie générale = encaissements clients validés − dépenses Admin payées − entrées de caisse transférées au gestionnaire.

Exemple : 1 000 Ar encaissés auprès des clients, 300 Ar transférés au gestionnaire, 100 Ar dépensés par lui, 150 Ar d'achat Admin payé : trésorerie générale 550 Ar ; caisse gestionnaire 200 Ar ; dépense à imputer aux budgets des chantiers concernés 250 Ar.

## Corrections

- Sélection d'un chantier : budget, recettes, dépenses détaillées et caisse filtrés jusqu'à la date du jour ; option « Tous les chantiers » pour l'ensemble. La trésorerie générale reste commune à tous les chantiers.
- Chantiers supprimés exclus des listes et du tableau de bord ; nom du chantier affiché au lieu de l'identifiant interne `CH-...`. Enregistrements incomplets sans données chantier exclus du décompte.
- Graphiques mensuels et répartition des dépenses visibles même lorsque les montants sont nuls.
- Date, exercice dynamique et état Cloud lisibles dans l'en-tête. Le pointage utilise l'identifiant de l'employé et les états 0, 0,5 ou 1 jour ; si aucun employé n'est présent dans le registre, un message l'indique.
- Journal caisse et détail du chiffre d'affaires corrigés pour afficher de vrais mouvements et factures.

## Remise à zéro des données d'essai

Cette installation n'efface aucune donnée automatiquement. Seul un Admin connecté au Cloud voit le bouton « Effacer les données d'essai ». Le bouton télécharge d'abord une sauvegarde JSON contenant les collections Cloud et les données locales. Vérifier que ce fichier est bien téléchargé, puis saisir `REINITIALISER`. Les chantiers, fournisseurs, employés et comptes de connexion sont conservés. Les autres collections métier synchronisées sont marquées supprimées, afin de pouvoir retrouver les enregistrements dans la sauvegarde. En cas de problème de permission Cloud ou de synchronisation, la procédure s'interrompt et affiche une erreur ; conserver le JSON.

## Vérification

Syntaxe JavaScript contrôlée avec `node --check`. Test de calcul exécuté sur données fictives : encaissement validé, transfert caisse, dépense Gestionnaire, achat Admin payé, dépense en attente, chantier supprimé, rendu des trois graphiques. La synchronisation avec votre compte Firebase et le bouton de remise à zéro nécessitent une vérification dans votre session Admin réelle avant l'utilisation en production.

## Fanitsiana fanampiny: encaissement client sy pourcentage

Ny pourcentage de facturation (tranche de facture) dia misaraka amin'ny pourcentage tena voaloan'ny client. Ao amin'ny « Encaissements clients », ny Admin na Gestionnaire dia afaka mampiditra montant na pourcentage amin'ny totalin'ny contrat an'ilay client sy chantier. Ny contrat dia alaina amin'ny devis accepté, na amin'ny montant du contrat voasoratra amin'ny facture raha tsy misy devis; raha tsy hita ny contrat dia tsy azo hamarinina ny reste à payer ary mila mameno devis/facture aloha.

Ny tabilao « Suivi des paiements par client et chantier » dia mampiseho contrat, vola efa voaray sy validé, pourcentage efa voaloa, ary reste à payer. Encaissement « En attente » tsy manova ireo totaly ireo mandra-pankatoavan'ny Admin azy. Ny fanamarinana vaovao dia mandà encaissement mihoatra ny contrat an'ilay client/chantier, ary mandà facture nofidiana izay an'ny client na chantier hafa. Ny tranche de facture tsirairay dia tsy atambatra amin'ny an'ny client hafa ao amin'ny chantier iray. Ny fanoratana ny anaran'ny client amin'ny datalist dia ampiana anaran'ny clients, devis ary factures efa voasoratra, ary ampitovina ny elanelana, renisoratra sy accent rehefa ampitahaina ny anarana.

Ohatra: contrat 1 000 000 Ar, encaissement 25% = 250 000 Ar. Rehefa validé, 25% no efa voaloa ary 750 000 Ar no reste à payer amin'ny contrat; ny « créance facturée » kosa mbola kajy hafa (factures − encaissements validés). Raha misy encaissement taloha izay tsy manana devis na facture ahitana ny totalin'ny contrat, ny totaly sy ny pourcentage dia aseho ho « Contrat à renseigner » mandra-pahitana ilay base.

Nosedraina ankoatra ny fitsapana etsy ambony ny client roa amin'ny chantier iray, ny client iray amin'ny chantier roa, ny encaissement en attente, ary ny tsy fanisana indroa ny devis sy ny facture mifandray aminy. Mbola mila andramana amin'ny kaonty Firebase tena izy ny famoahana Cloud.

## Fanamarinana farany sy fetran'ny patch

- Tsy tafiditra amin'ny totalin'ny tableau de bord, ny graphique finance ary ny journal actif ny mouvement mifamatotra amin'ny chantier voafafa. Ny anaran'ny chantier no aseho amin'ny rapport technique sy journalier, fa tsy ny identifiant anatiny rehefa fantatra ilay chantier.
- Devis accepté misy encaissement validé: azo ahitsy ihany ny réduction sy montant raha mbola tsy ambany noho ny vola efa voaray ilay totalin'ny devis accepté rehetra ho an'ilay client sy chantier. Tsy azo afindra client/chantier, ovaina statut na fafana izy raha efa misy encaissement validé; raha misy facture efa mifamatotra kosa dia tsy azo ovaina ny total na statut mba tsy hanova facture efa navoaka. Ny devis sy ny budget chantier nohavaozina dia alefa amin'ny synchronisation Cloud.
- Ny dépenses tena voaloa ihany no ao amin'ny journal général; ny achat efa voaloa sy paie dia tsy isaina indroa. Ny Gestionnaire tsy afaka manefa amin'ny caisse raha tsy ampy ny solde; Admin ihany no mampiditra entrée de caisse réelle. Ny budget sy ny détail finance dia afenina amin'ny Gestionnaire ao amin'ny dashboard finance.
- Test local: `node --check app.js` sy `node audit_smoke_test.cjs`; mampiasa données fictives ihany ilay test, tsy mampiasa ny compte tena izy. Tsy voamarina eto ny Firebase Rules, ny synchronisation multi-appareil amin'ny compte tena izy, ny famafana test Cloud, na ny fizotry ny asa rehetra amin'ny ERP; ataovy sauvegarde sy recette amin'ny kaonty Admin alohan'ny production.

## Devis nifampiraharahana → budget chantier

Ohatra: devis voalohany 100 000 000 Ar, réduction nifanarahana tamin'ny client 5 000 000 Ar, devis farany accepté 95 000 000 Ar. Rehefa tehirizina ho « Accepté » dia 95 000 000 Ar ny budget chantier ary izany koa ny base contrat client. Tsy manome vola ao amin'ny caisse ny fanekena devis; ny encaissement validé ihany no mampiakatra ny trésorerie. Raha mbola tsy nisy facture, azo ovaina indray ny réduction na dia efa nisy paiement ampahany aza, raha tsy latsaky ny encaissements validés ny montant farany. Raha misy facture navoaka, ahitsio aloha ny facturation alohan'ny hanovana ny montant du devis. Raha devis accepté maromaro no an'ny chantier iray, ny fitambaran'ny montant farany no budget; rehefa tsy misy devis accepté intsony dia miverina ny budget manuel voatahiry.

## Facture, attachement sy reste à payer

Mifidiana chantier, avy eo ny devis « Accepté ». Hafindra ho azy ao amin'ny formulaire facture ny anaran'ny client, montant contrat, OBJET du devis, ary ireo lignes techniques (désignations, unités, quantités, PU, réduction sy TVA) ho an'ny kajy ihany. Mitahiry kopian'ireo lignes du devis ilay facture ho référence interne, ka tsy miova tampoka ny contenu historique raha ovaina tatỳ aoriana ny devis. Ny **désignation aseho amin'ny facture** kosa dia avy amin'ny OBJET du devis ary azo ovaina. Ny budget chantier dia fitambaran'ny devis acceptés an'ilay chantier; ny plafond facturable amin'ny facture iray dia ny totalin'ilay devis voafidy.

Misy fomba roa:

- « Tranche / acompte »: ampidiro mivantana ny montant marina, ohatra 45 000 000 Ar, dia hivoaka ho azy ny pourcentage mifanaraka amin'ny devis 95 000 000 Ar. Aseho ho référence ny quantités sy PU feno ao amin'ny devis, fa tsy lazaina hoe efa vita avokoa ireo travaux.
- « Attachement »: ampidiro isaky ny ligne ny quantité tena vita. Avy amin'ny quantité × PU du devis, miaraka amin'ny réduction sy TVA zaraina au prorata, no kajiana ny montant de facture. Tsy azo ampidirina indroa ny quantité efa facturée tamin'ny attachement teo aloha, ary tsy mahazo mihoatra ny total du devis ny factures mitambatra.

Raha 95 000 000 Ar ny contrat ary 45 000 000 Ar ny facture voalohany: 50 000 000 Ar ny **reste à facturer**. Raha mbola tsy nisy vola voaray, 95 000 000 Ar ny **reste à payer du client** ary 45 000 000 Ar ny créance facturée. Raha misy encaissement validé 20 000 000 Ar: 75 000 000 Ar ny reste à payer contrat, 25 000 000 Ar ny créance facturée. Ny vola ampifandraisina amin'ny facture iray dia tsy mahazo mihoatra ny montant an'io facture io; ny paiement global tsy voatondro facture dia mbola isaina ao amin'ny totalin'ny client.

Ao amin'ny « Voir détail » ny **désignation manokana an'ilay facture** (fa tsy lisitr'ireo détails du devis), montant facture, montant déjà attribué à cette facture, reste sur cette facture, reste à facturer du devis ary reste à payer du client. Azo atao « Imprimer / PDF ». Ny quantités sy PU ao amin'ny formulaire dia reference hanaovana kajy attachement fotsiny. Nosedraina tamin'ny `audit_smoke_test.cjs` ny facture 45 000 000 Ar, attachement misy quantité iray amin'ny roa, fanakanana doublon, ary fiovan'ny solde rehefa misy paiement. Mbola mila recette amin'ny Firebase tena izy mialoha ny fampiasana production.

## Désignation facture azo ovaina

Ohatra OBJET du devis: « Travaux de finition d’un bâtiment ». Raha facture 45 000 000 Ar voalohany, ny champ « Désignation de la facture » dia misoratra avy hatrany amin'io OBJET io, avy eo afaka soratan'ny Admin hoe « Première tranche sur paiement des travaux de finition d’un bâtiment ». Azo ovaina koa ny n° facture, date, client aseho eo amin'ny facture, note ary montant tranche raha mbola manaraka ny contrat sy ny encaissements validés. Mijanona ho référence technique ao amin'ny ERP ny client sy ny montant du devis accepté, mba tsy hifindra amin'ny client hafa ny dette na hihoatra ny budget ny facturation. Ny facture efa misy paiement dia mbola azo ahitsy ny soratra; ny fanovana montant dia voarara raha latsaky ny paiement efa nifandraika tamin'io facture io. Notsapaina ny fanovana désignation sy anaran'ny client aseho taorian'ny paiement nefa tsy niova ny reste à payer.
## Module distinct : prévision matériaux et outillage

Le menu « PRÉVISION MATÉRIAUX » ouvre un document interne lié à un devis et au chantier correspondant. Le devis remis au client et son montant restent indépendants. L’Admin peut générer, ajuster et enregistrer les coefficients de consommation, taux de perte, conditionnements, lots d’achat, matériaux supplémentaires, outils et observations. Les autres rôles peuvent consulter et imprimer les quantités pour leurs chantiers accessibles, sans voir les prix du devis dans ce module. Utiliser « Imprimer / PDF » pour remettre le plan à l’équipe.

Toutes les désignations non vides du devis client existant sont reprises, même lorsque leur quantité est provisoirement nulle. La nomenclature indicative propose des matériaux ET des matériels pour l’installation de chantier, terrassement, fondations, structure, maçonnerie, enduits, carrelage, peinture, électricité, plomberie, toiture, menuiseries, étanchéité et VRD. Une désignation inconnue reçoit elle aussi une ligne « matériaux à préciser » et une ligne « outillage selon nature des travaux » ; elle ne disparaît pas. Chaque poste reste attaché à sa désignation du devis. L’Admin peut modifier les noms, unités, coefficients, pertes, conditionnements, lots d’achat, quantités corrigées et observations, réaffecter les lignes, ajouter ou retirer matériaux et matériels. Il peut aussi corriger les libellés internes des tâches et lots du Gantt ; pour changer le devis adressé au client, utiliser son éditeur existant et enregistrer de nouveau.

Exemple : carrelage 100 m², carreaux 60 × 60 cm, perte prévisionnelle 10 %, commande arrondie à la dizaine supérieure = 310 carreaux (besoin arrondi à l’unité avant lot : 306). Colle estimée à 5 kg/m², perte 10 %, sacs de 25 kg = 22 sacs. La valeur de 40 sacs de l’exemple utilisateur est obtenue si l’Admin ajuste la consommation à 10 kg/m² et la perte à 0 %. Ce sont des hypothèses modifiables, pas des quantités contractuelles. Pour tous les autres postes dont l’unité, le métré, les plans ou la composition manquent, le système propose les noms des matériaux et affiche « À chiffrer » sans fabriquer des quantités. Une quantité corrigée peut être inscrite directement après l’étude des plans.

Le plan est conservé dans le devis sous `materialForecast` et synchronisé dans la même collection Cloud `quotes`. Si les désignations, unités ou quantités du devis changent, le module signale que la prévision doit être actualisée ; l’actualisation explicite remplace les corrections enregistrées après confirmation. Une copie d’un devis ne reprend pas la prévision de l’original. L’Admin doit sauvegarder le plan avant de changer de devis ou de page. Le nombre d’outils est une proposition d’équipement, pas un achat automatique. Les montants du devis, budget chantier, facture et encaissements ne sont pas modifiés par ce plan.

Vérification locale : `node --check app.js` et `node audit_smoke_test.cjs`, avec contrôle de 310 carreaux, 22 sacs indicatifs, ajustement donnant 40 sacs, couverture de cinq désignations dont installation de chantier et électricité sans quantité, maintien d’une correction manuelle lors de la migration d’un ancien plan, absence de modification du devis client et accès en lecture seule au rôle Technicien. Les permissions Firestore du compte réel et le rendu d’impression dans le navigateur restent à vérifier lors de la recette.
## Planning Gantt dans la prévision interne

Le document « PRÉVISION MATÉRIAUX » contient aussi un planning Gantt fondé sur **toutes les désignations du devis**, y compris les lignes dont la quantité est provisoirement nulle. Les lots et les libellés proviennent du devis ; aucun prix client n’est affiché dans ce planning. La répartition initiale des dates est indicative et séquentielle, à parts égales dans l’intervalle « Début » → « Fin prévue » du chantier. Lorsque ces dates manquent ou sont incohérentes, le logiciel propose 7 jours par désignation à partir de la date du chantier ou du devis et signale ce caractère indicatif. Il ne prétend pas calculer la durée à partir du prix ou de la quantité.

L’Admin peut ajuster le début, la fin et le pourcentage réalisé de chaque tâche, enregistrer le plan et lancer « Générer / réinitialiser le Gantt » s’il souhaite remplacer ses dates par la répartition automatique. Le planning et les matériaux figurent ensemble sur le document interne « Imprimer / PDF » ; les autres rôles ont accès à la consultation sans champs d’édition. Si les désignations du devis changent, l’Admin doit actualiser le plan depuis le devis avant de sauvegarder. Les dépendances entre corps d’état, la disponibilité des équipes et les délais fournisseurs doivent être revus par le responsable de chantier avant validation du calendrier.

Test local complémentaire : trois désignations réparties du 01/10/2026 au 12/10/2026, y compris une ligne à quantité nulle ; correction manuelle d’une date et de l’avancement, conservation après enregistrement, refus d’une fin antérieure au début, contrôle lecture seule Technicien. Le rendu d’impression sur le navigateur et la synchronisation avec les comptes Cloud réels restent à vérifier sur l’installation utilisée.
