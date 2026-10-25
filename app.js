// ============================================================================
// ERP-NYSOA CONSTRUCT - LOGIQUE FINANCIERE (DEVIS, BUDGETS, DEPENSES & ALERTES)
// Fonctionne immédiatement sur Netlify / GitHub Pages (LocalStorage + Sync Firebase)
// ============================================================================

const STORAGE_KEY_CHANTIERS = "erp_nysoa_chantiers_v1";
const STORAGE_KEY_JOURNAL = "erp_nysoa_journal_v1";

// Données initiales de démonstration réalistes pour Nysoa Construct
const DEMO_CHANTIERS = [
  {
    id: "PROJ-2026-01",
    nom_chantier: "Aménagement Bureau & Sanitaire",
    client_nom: "Facility Upgrade Sept",
    source_budget: "DEVIS",
    reference_devis: "DEV-2026-089",
    montant_initial_devis: 16000000,
    remise_accorde: 1000000,
    montant_facturable_client: 15000000,
    plafond_materiaux: 7500000,
    plafond_main_doeuvre: 3500000,
    plafond_depenses_total: 11000000,
    total_encaisse_client: 9000000,
    depenses_materiaux: 6800000,
    depenses_main_doeuvre: 2450000,
    total_depenses_actuelles: 9250000,
    date_creation: "2026-09-15"
  },
  {
    id: "PROJ-2026-02",
    nom_chantier: "Maintenance Serrures, Plomberie & Support Starlink",
    client_nom: "TS HERMAN",
    source_budget: "MANUEL",
    reference_devis: "SANS-DEVIS",
    montant_initial_devis: 2400000,
    remise_accorde: 0,
    montant_facturable_client: 2400000,
    plafond_materiaux: 1000000,
    plafond_main_doeuvre: 600000,
    plafond_depenses_total: 1600000,
    total_encaisse_client: 1500000,
    depenses_materiaux: 620000,
    depenses_main_doeuvre: 380000,
    total_depenses_actuelles: 1000000,
    date_creation: "2026-10-05"
  }
];

const DEMO_JOURNAL = [
  {
    id: "OP-1",
    date: "2026-10-18",
    chantier_id: "PROJ-2026-01",
    chantier_nom: "Aménagement Bureau & Sanitaire",
    type: "DEPENSE",
    categorie: "MATERIAUX",
    motif: "Achat accessoires plomberie & électricité",
    montant: 1450000
  },
  {
    id: "OP-2",
    date: "2026-10-20",
    chantier_id: "PROJ-2026-01",
    chantier_nom: "Aménagement Bureau & Sanitaire",
    type: "DEPENSE",
    categorie: "POINTAGE_MO",
    motif: "Pointage semaine équipe maçonnerie & finition",
    montant: 850000
  },
  {
    id: "OP-3",
    date: "2026-10-22",
    chantier_id: "PROJ-2026-02",
    chantier_nom: "Maintenance Serrures, Plomberie & Support Starlink",
    type: "ENCAISSEMENT",
    categorie: "ACOMPTE",
    motif: "Acompte démarrage client TS HERMAN",
    montant: 1500000
  }
];

let chantiers = [];
let journal = [];
let etapeDevisCourante = 1;

// Formatage monétaire Ariary
function formatAr(val) {
  return new Intl.NumberFormat("fr-FR").format(Math.round(Number(val) || 0)) + " Ar";
}

// Initialisation au chargement
document.addEventListener("DOMContentLoaded", () => {
  chargerDonnees();
  rafraichirInterfaceComplete();
  calculerDevisTempsReel();
  calculerManuelTempsReel();
});

function chargerDonnees() {
  const savedChantiers = localStorage.getItem(STORAGE_KEY_CHANTIERS);
  const savedJournal = localStorage.getItem(STORAGE_KEY_JOURNAL);

  chantiers = savedChantiers ? JSON.parse(savedChantiers) : [...DEMO_CHANTIERS];
  journal = savedJournal ? JSON.parse(savedJournal) : [...DEMO_JOURNAL];
}

function sauvegarderDonnees() {
  localStorage.setItem(STORAGE_KEY_CHANTIERS, JSON.stringify(chantiers));
  localStorage.setItem(STORAGE_KEY_JOURNAL, JSON.stringify(journal));
  // Si Firebase est configuré dans firebase-service.js, on peut également déclencher la synchro ici
  if (typeof window.syncToFirestoreIfConfigured === "function") {
    window.syncToFirestoreIfConfigured(chantiers, journal);
  }
}

function resetDemoData() {
  if (confirm("Voulez-vous restaurer les données de démonstration initiales ?")) {
    localStorage.removeItem(STORAGE_KEY_CHANTIERS);
    localStorage.removeItem(STORAGE_KEY_JOURNAL);
    chargerDonnees();
    rafraichirInterfaceComplete();
  }
}

// Navigation entre les 3 écrans
function switchView(viewName) {
  ["dashboard", "devis", "manuel"].forEach((v) => {
    document.getElementById(`view-${v}`).classList.toggle("hidden", v !== viewName);
    const btn = document.getElementById(`navBtn-${v}`);
    if (v === viewName) {
      btn.className = "px-4 py-2.5 rounded-lg text-sm font-bold bg-blue-600 text-white shadow";
    } else {
      btn.className = "px-4 py-2.5 rounded-lg text-sm font-bold bg-white text-slate-700 hover:bg-slate-200 border border-slate-300";
    }
  });
}

// ============================================================================
// RAFRAICHISSEMENT DU TABLEAU DE BORD & JAUGES D'ALERTE PLAFOND
// ============================================================================
function rafraichirInterfaceComplete() {
  calculerKPIsGlobaux();
  afficherCartesChantiers();
  remplirSelecteursChantiers();
  afficherJournalOperations();
  verifierPreAlerteDepense();
}

function calculerKPIsGlobaux() {
  let totalFacturable = 0;
  let totalEncaisse = 0;
  let totalPlafond = 0;
  let totalDepenses = 0;

  chantiers.forEach((c) => {
    totalFacturable += Number(c.montant_facturable_client) || 0;
    totalEncaisse += Number(c.total_encaisse_client) || 0;
    totalPlafond += Number(c.plafond_depenses_total) || 0;
    totalDepenses += Number(c.total_depenses_actuelles) || 0;
  });

  const resteARecouvrer = Math.max(0, totalFacturable - totalEncaisse);
  const budgetDisponible = totalPlafond - totalDepenses;
  const margeActuelle = totalFacturable - totalDepenses;
  const reserveSecurite = Math.max(0, margeActuelle * 0.1);

  document.getElementById("kpiTotalFacturable").innerText = formatAr(totalFacturable);
  document.getElementById("kpiResteARecouvrer").innerText = `Reste à recouvrer client : ${formatAr(resteARecouvrer)}`;
  document.getElementById("kpiTotalPlafond").innerText = formatAr(totalPlafond);
  document.getElementById("kpiTotalDepenses").innerText = formatAr(totalDepenses);

  const elBudgetRestant = document.getElementById("kpiBudgetRestant");
  if (budgetDisponible >= 0) {
    elBudgetRestant.innerText = `Enveloppe disponible : ${formatAr(budgetDisponible)}`;
    elBudgetRestant.className = "text-xs text-emerald-600 font-semibold mt-1";
  } else {
    elBudgetRestant.innerText = `DÉPASSEMENT GLOBAL : ${formatAr(Math.abs(budgetDisponible))}`;
    elBudgetRestant.className = "text-xs text-red-600 font-bold mt-1";
  }

  document.getElementById("kpiMargeReelle").innerText = formatAr(margeActuelle);
  document.getElementById("kpiReserveNysoa").innerText = `Réserve sécurité conseillée (10%) : ${formatAr(reserveSecurite)}`;
}

function afficherCartesChantiers() {
  const container = document.getElementById("chantiersContainer");
  container.innerHTML = "";

  chantiers.forEach((c) => {
    const plafond = Number(c.plafond_depenses_total) || 1;
    const depenses = Number(c.total_depenses_actuelles) || 0;
    const pourcentageConsomme = Math.round((depenses / plafond) * 100);
    const restantBudget = plafond - depenses;
    const margeChantier = Number(c.montant_facturable_client) - depenses;
    const resteClient = Math.max(0, Number(c.montant_facturable_client) - Number(c.total_encaisse_client));

    // Définition couleur et message d'alerte selon le seuil (Normal < 80%, Attention >= 80%, Dépassement > 100%)
    let barColor = "bg-emerald-500";
    let borderCard = "border-slate-200";
    let badgeAlerte = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">✅ Budget Maîtrisé (${pourcentageConsomme}%)</span>`;
    let bannerDépassement = "";

    if (pourcentageConsomme > 100) {
      barColor = "bg-red-600";
      borderCard = "border-red-500 ring-2 ring-red-200";
      badgeAlerte = `<span class="px-2.5 py-1 rounded-full text-xs font-extrabold bg-red-100 text-red-800 animate-pulse">🚨 PLAFOND DÉPASSÉ (${pourcentageConsomme}%)</span>`;
      bannerDépassement = `
        <div class="mt-3 p-2.5 rounded-lg bg-red-50 border border-red-300 text-xs text-red-800 font-semibold flex items-center justify-between">
          <span><i class="fa-solid fa-triangle-exclamation mr-1"></i> Dépassement de plafond de <strong>${formatAr(Math.abs(restantBudget))}</strong> ! La marge Nysoa est directement réduite.</span>
        </div>
      `;
    } else if (pourcentageConsomme >= 80) {
      barColor = "bg-amber-500";
      borderCard = "border-amber-400";
      badgeAlerte = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900">⚠️ Seuil Critique 80% atteint (${pourcentageConsomme}%)</span>`;
      bannerDépassement = `
        <div class="mt-3 p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-900 font-medium">
          <i class="fa-solid fa-bell mr-1"></i> Attention : Il ne reste que <strong>${formatAr(restantBudget)}</strong> sur le budget autorisé de ce chantier.
        </div>
      `;
    }

    const badgeSource = c.source_budget === "DEVIS"
      ? `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800">Issue Devis ${c.reference_devis || ""}</span>`
      : `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-800">Budget Manuel (Sans Devis)</span>`;

    const cardHTML = `
      <div class="bg-white p-5 rounded-xl shadow-sm border ${borderCard} transition">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xs font-mono text-slate-400">${c.id}</span>
              ${badgeSource}
              ${ c.remise_accorde > 0 ? `<span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800">Remise client: -${formatAr(c.remise_accorde)}</span>` : "" }
            </div>
            <h3 class="text-base font-bold text-slate-900 mt-1">${c.nom_chantier}</h3>
            <p class="text-xs text-slate-500">Client : <strong>${c.client_nom}</strong></p>
          </div>
          ${badgeAlerte}
        </div>

        <!-- Barre de progression Dépenses vs Plafond -->
        <div class="my-3">
          <div class="flex justify-between text-xs font-semibold mb-1">
            <span class="text-slate-600">Dépenses engagées : <strong class="text-slate-900">${formatAr(depenses)}</strong></span>
            <span class="text-slate-600">Plafond autorisé : <strong class="text-sky-700">${formatAr(plafond)}</strong></span>
          </div>
          <div class="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
            <div class="h-full ${barColor} transition-all duration-300" style="width: ${Math.min(100, pourcentageConsomme)}%"></div>
          </div>
          <div class="flex justify-between text-[11px] text-slate-500 mt-1">
            <span>Matériaux: ${formatAr(c.depenses_materiaux)} / ${formatAr(c.plafond_materiaux)}</span>
            <span>Main-d'œuvre (Pointage): ${formatAr(c.depenses_main_doeuvre)} / ${formatAr(c.plafond_main_doeuvre)}</span>
          </div>
        </div>

        <!-- Chiffres clés du chantier -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-slate-100 text-xs">
          <div class="bg-slate-50 p-2 rounded">
            <span class="text-slate-400 block">Net Facturable Client</span>
            <span class="font-bold text-slate-800">${formatAr(c.montant_facturable_client)}</span>
          </div>
          <div class="bg-slate-50 p-2 rounded">
            <span class="text-slate-400 block">Reste à payer Client</span>
            <span class="font-bold ${resteClient > 0 ? 'text-amber-600' : 'text-emerald-600'}">${formatAr(resteClient)}</span>
          </div>
          <div class="bg-slate-50 p-2 rounded">
            <span class="text-slate-400 block">Budget Dépense Restant</span>
            <span class="font-bold ${restantBudget >= 0 ? 'text-sky-700' : 'text-red-600'}">${formatAr(restantBudget)}</span>
          </div>
          <div class="bg-slate-50 p-2 rounded">
            <span class="text-slate-400 block">Marge Actuelle Chantier</span>
            <span class="font-bold ${margeChantier >= 0 ? 'text-emerald-700' : 'text-red-600'}">${formatAr(margeChantier)}</span>
          </div>
        </div>

        ${bannerDépassement}
      </div>
    `;
    container.insertAdjacentHTML("beforeend", cardHTML);
  });
}

function remplirSelecteursChantiers() {
  const depSelect = document.getElementById("depChantierSelect");
  const encSelect = document.getElementById("encChantierSelect");
  if (!depSelect || !encSelect) return;

  const currentDepVal = depSelect.value;
  depSelect.innerHTML = "";
  encSelect.innerHTML = "";

  chantiers.forEach((c) => {
    const restant = c.plafond_depenses_total - c.total_depenses_actuelles;
    const opt1 = document.createElement("option");
    opt1.value = c.id;
    opt1.textContent = `${c.nom_chantier} (Dispo: ${formatAr(restant)})`;
    depSelect.appendChild(opt1);

    const resteClient = Math.max(0, c.montant_facturable_client - c.total_encaisse_client);
    const opt2 = document.createElement("option");
    opt2.value = c.id;
    opt2.textContent = `${c.nom_chantier} (Reste client: ${formatAr(resteClient)})`;
    encSelect.appendChild(opt2);
  });

  if (currentDepVal) depSelect.value = currentDepVal;
}

// ============================================================================
// CONTROLE PRE-ALERTE AVANT DECAISSEMENT & AJOUT DEPENSE / POINTAGE
// ============================================================================
function verifierPreAlerteDepense() {
  const chantierId = document.getElementById("depChantierSelect").value;
  const montantSaisi = Number(document.getElementById("depMontant").value) || 0;
  const box = document.getElementById("preAlerteDepenseBox");

  const ch = chantiers.find((c) => c.id === chantierId);
  if (!ch || montantSaisi <= 0) {
    box.classList.add("hidden");
    return;
  }

  const nouveauTotalDepenses = ch.total_depenses_actuelles + montantSaisi;
  const plafond = ch.plafond_depenses_total;
  const nouveauPct = Math.round((nouveauTotalDepenses / plafond) * 100);
  const ecart = plafond - nouveauTotalDepenses;

  box.classList.remove("hidden");
  if (nouveauTotalDepenses > plafond) {
    box.className = "p-3 rounded-lg text-xs font-semibold bg-red-100 border border-red-400 text-red-900";
    box.innerHTML = `🚨 <strong>ALERTE DÉPASSEMENT PLAFOND :</strong> Cette sortie de ${formatAr(montantSaisi)} fera passer le budget à <strong>${nouveauPct}%</strong> (Dépassement de <strong>${formatAr(Math.abs(ecart))}</strong> au-dessus du plafond autorisé) !`;
  } else if (nouveauPct >= 80) {
    box.className = "p-3 rounded-lg text-xs font-semibold bg-amber-100 border border-amber-400 text-amber-900";
    box.innerHTML = `⚠️ <strong>ATTENTION SEUIL 80% :</strong> Après cette dépense, vous aurez consommé <strong>${nouveauPct}%</strong> du budget. Il ne restera plus que <strong>${formatAr(ecart)}</strong>.`;
  } else {
    box.className = "p-3 rounded-lg text-xs font-medium bg-emerald-50 border border-emerald-300 text-emerald-800";
    box.innerHTML = `✅ <strong>Budget respecté :</strong> Consommation après dépense : <strong>${nouveauPct}%</strong> (Reste disponible : ${formatAr(ecart)}).`;
  }
}

function ajouterDepenseChantier(event) {
  event.preventDefault();
  const chantierId = document.getElementById("depChantierSelect").value;
  const categorie = document.getElementById("depCategorie").value;
  const montant = Number(document.getElementById("depMontant").value) || 0;
  const motif = document.getElementById("depMotif").value.trim();

  const ch = chantiers.find((c) => c.id === chantierId);
  if (!ch || montant <= 0) return;

  const futurTotal = ch.total_depenses_actuelles + montant;
  if (futurTotal > ch.plafond_depenses_total) {
    const depassement = futurTotal - ch.plafond_depenses_total;
    const confirmation = confirm(
      `⚠️ ALERTE PLAFOND DÉPASSÉ !

` +
      `Chantier : ${ch.nom_chantier}
` +
      `Plafond autorisé : ${formatAr(ch.plafond_depenses_total)}
` +
      `Dépenses après opération : ${formatAr(futurTotal)}
` +
      `Dépassement : +${formatAr(depassement)}

` +
      `Voulez-vous quand même autoriser ce décaissement (validation forcée) ?`
    );
    if (!confirmation) return;
  }

  // Mise à jour des cumuls du chantier
  ch.total_depenses_actuelles += montant;
  if (categorie === "MATERIAUX") {
    ch.depenses_materiaux += montant;
  } else {
    ch.depenses_main_doeuvre += montant;
  }

  // Ajout dans le journal
  journal.unshift({
    id: "OP-" + Date.now(),
    date: new Date().toISOString().slice(0, 10),
    chantier_id: ch.id,
    chantier_nom: ch.nom_chantier,
    type: "DEPENSE",
    categorie: categorie,
    motif: motif,
    montant: montant
  });

  document.getElementById("depMontant").value = "";
  document.getElementById("depMotif").value = "";
  sauvegarderDonnees();
  rafraichirInterfaceComplete();
}

function ajouterEncaissementClient(event) {
  event.preventDefault();
  const chantierId = document.getElementById("encChantierSelect").value;
  const montant = Number(document.getElementById("encMontant").value) || 0;
  const typePaiement = document.getElementById("encType").value;

  const ch = chantiers.find((c) => c.id === chantierId);
  if (!ch || montant <= 0) return;

  ch.total_encaisse_client += montant;

  journal.unshift({
    id: "OP-" + Date.now(),
    date: new Date().toISOString().slice(0, 10),
    chantier_id: ch.id,
    chantier_nom: ch.nom_chantier,
    type: "ENCAISSEMENT",
    categorie: typePaiement,
    motif: `Paiement client (${typePaiement}) - ${ch.client_nom}`,
    montant: montant
  });

  document.getElementById("encMontant").value = "";
  sauvegarderDonnees();
  rafraichirInterfaceComplete();
}

function afficherJournalOperations() {
  const tbody = document.getElementById("journalTableBody");
  tbody.innerHTML = "";

  journal.slice(0, 15).forEach((op) => {
    const isEntree = op.type === "ENCAISSEMENT";
    const badgeType = isEntree
      ? `<span class="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">+ ENCAISSEMENT (${op.categorie})</span>`
      : `<span class="px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800">- DÉPENSE (${op.categorie})</span>`;

    const row = `
      <tr class="hover:bg-slate-50">
        <td class="py-2.5 px-3 font-mono text-xs text-slate-500">${op.date}</td>
        <td class="py-2.5 px-3 font-semibold text-slate-800">${op.chantier_nom}</td>
        <td class="py-2.5 px-3">${badgeType}</td>
        <td class="py-2.5 px-3 text-slate-600">${op.motif}</td>
        <td class="py-2.5 px-3 text-right font-bold ${isEntree ? 'text-emerald-600' : 'text-red-600'}">
          ${isEntree ? '+' : '-'} ${formatAr(op.montant)}
        </td>
      </tr>
    `;
    tbody.insertAdjacentHTML("beforeend", row);
  });
}

// ============================================================================
// WORKFLOW VALIDATION DEVIS (3 ETAPES) -> TRANSFORMATION EN BUDGET
// ============================================================================
function toggleNegociationDevis() {
  const checked = document.getElementById("devCheckReduction").checked;
  const box = document.getElementById("devBoxReduction");
  if (checked) {
    box.classList.remove("opacity-50", "pointer-events-none");
    setEtapeDevis(2);
  } else {
    box.classList.add("opacity-50", "pointer-events-none");
    document.getElementById("devValeurReduction").value = 0;
    calculerDevisTempsReel();
  }
}

function setEtapeDevis(etape) {
  etapeDevisCourante = etape;
  const badge = document.getElementById("badgeStatutDevis");
  const c1 = document.getElementById("stepCard1");
  const c2 = document.getElementById("stepCard2");
  const c3 = document.getElementById("stepCard3");

  [c1, c2, c3].forEach((c) => (c.className = "p-3 rounded-lg border border-slate-200 bg-slate-50"));

  if (etape === 1) {
    badge.innerText = "ÉTAPE 1 : ENVOYÉ AU CLIENT";
    badge.className = "px-4 py-1.5 text-xs font-extrabold rounded-full bg-blue-100 text-blue-800";
    c1.className = "p-3 rounded-lg border-2 border-blue-600 bg-blue-50/40";
  } else if (etape === 2) {
    badge.innerText = "ÉTAPE 2 : EN NÉGOCIATION (RÉDUCTION)";
    badge.className = "px-4 py-1.5 text-xs font-extrabold rounded-full bg-amber-100 text-amber-800";
    c2.className = "p-3 rounded-lg border-2 border-amber-500 bg-amber-50/40";
  } else if (etape === 3) {
    badge.innerText = "ÉTAPE 3 : VALIDÉ EN BUDGET OFFICIEL";
    badge.className = "px-4 py-1.5 text-xs font-extrabold rounded-full bg-emerald-100 text-emerald-800";
    c3.className = "p-3 rounded-lg border-2 border-emerald-600 bg-emerald-50/40";
  }
}

function calculerDevisTempsReel() {
  const montantInitial = Number(document.getElementById("devMontantInitial").value) || 0;
  const coutMat = Number(document.getElementById("devCoutMat").value) || 0;
  const coutMo = Number(document.getElementById("devCoutMo").value) || 0;
  const plafondTotal = coutMat + coutMo;

  const aRemise = document.getElementById("devCheckReduction").checked;
  const typeRemise = document.getElementById("devTypeReduction").value;
  const valRemise = Number(document.getElementById("devValeurReduction").value) || 0;

  let remiseAriary = 0;
  if (aRemise) {
    remiseAriary = typeRemise === "POURCENTAGE" ? montantInitial * (valRemise / 100) : valRemise;
  }

  const netFinalClient = Math.max(0, montantInitial - remiseAriary);
  const margePrevue = netFinalClient - plafondTotal;
  const tauxMarge = netFinalClient > 0 ? ((margePrevue / netFinalClient) * 100).toFixed(1) : 0;

  document.getElementById("devResumeRemise").innerText = "- " + formatAr(remiseAriary);
  document.getElementById("devResumeNetClient").innerText = formatAr(netFinalClient);
  document.getElementById("devResumePlafond").innerText = formatAr(plafondTotal);
  document.getElementById("devResumeMarge").innerText = `${formatAr(margePrevue)} (${tauxMarge}%)`;

  const alerte = document.getElementById("devAlerteMargeFaible");
  if (tauxMarge < 15) {
    alerte.classList.remove("hidden");
  } else {
    alerte.classList.add("hidden");
  }

  return {
    montantInitial,
    coutMat,
    coutMo,
    plafondTotal,
    remiseAriary,
    netFinalClient,
    margePrevue
  };
}

function validerDevisEtActiverBudget() {
  const calc = calculerDevisTempsReel();
  const ref = document.getElementById("devReference").value.trim() || "DEV-" + Date.now();
  const nomChantier = document.getElementById("devNomChantier").value.trim();
  const nomClient = document.getElementById("devNomClient").value.trim();

  if (!nomChantier || !nomClient) {
    alert("Veuillez renseigner le nom du chantier et le client.");
    return;
  }

  setEtapeDevis(3);

  const nouveauChantier = {
    id: "PROJ-" + Math.floor(100 + Math.random() * 900),
    nom_chantier: nomChantier,
    client_nom: nomClient,
    source_budget: "DEVIS",
    reference_devis: ref,
    montant_initial_devis: calc.montantInitial,
    remise_accorde: calc.remiseAriary,
    montant_facturable_client: calc.netFinalClient,
    plafond_materiaux: calc.coutMat,
    plafond_main_doeuvre: calc.coutMo,
    plafond_depenses_total: calc.plafondTotal,
    total_encaisse_client: 0,
    depenses_materiaux: 0,
    depenses_main_doeuvre: 0,
    total_depenses_actuelles: 0,
    date_creation: new Date().toISOString().slice(0, 10)
  };

  chantiers.unshift(nouveauChantier);
  sauvegarderDonnees();
  rafraichirInterfaceComplete();

  alert(`✅ Devis "${ref}" validé en Étape 3 !
Le budget officiel (Plafond dépenses : ${formatAr(calc.plafondTotal)}) est maintenant actif dans le suivi des chantiers.`);
  switchView("dashboard");
}

// ============================================================================
// SAISIE BUDGET MANUEL DIRECT (SANS DEVIS)
// ============================================================================
function calculerManuelTempsReel() {
  const montantClient = Number(document.getElementById("manMontantClient").value) || 0;
  const mat = Number(document.getElementById("manCoutMat").value) || 0;
  const mo = Number(document.getElementById("manCoutMo").value) || 0;
  const plafond = mat + mo;
  const marge = montantClient - plafond;
  const taux = montantClient > 0 ? ((marge / montantClient) * 100).toFixed(1) : 0;

  document.getElementById("manResumePlafond").innerText = formatAr(plafond);
  document.getElementById("manResumeMarge").innerText = `${formatAr(marge)} (${taux}%)`;

  return { montantClient, mat, mo, plafond, marge };
}

function creerBudgetManuelDirect(event) {
  event.preventDefault();
  const calc = calculerManuelTempsReel();
  const nomChantier = document.getElementById("manNomChantier").value.trim();
  const nomClient = document.getElementById("manNomClient").value.trim();

  const nouveauChantier = {
    id: "MAN-" + Math.floor(100 + Math.random() * 900),
    nom_chantier: nomChantier,
    client_nom: nomClient,
    source_budget: "MANUEL",
    reference_devis: "SANS-DEVIS",
    montant_initial_devis: calc.montantClient,
    remise_accorde: 0,
    montant_facturable_client: calc.montantClient,
    plafond_materiaux: calc.mat,
    plafond_main_doeuvre: calc.mo,
    plafond_depenses_total: calc.plafond,
    total_encaisse_client: 0,
    depenses_materiaux: 0,
    depenses_main_doeuvre: 0,
    total_depenses_actuelles: 0,
    date_creation: new Date().toISOString().slice(0, 10)
  };

  chantiers.unshift(nouveauChantier);
  sauvegarderDonnees();
  rafraichirInterfaceComplete();

  document.getElementById("manNomChantier").value = "";
  document.getElementById("manNomClient").value = "";

  alert(`✅ Budget Manuel créé avec succès pour "${nomChantier}" !
Plafond de dépenses fixé à : ${formatAr(calc.plafond)}.`);
  switchView("dashboard");
}

// Export JSON de sauvegarde
function exportDataJSON() {
  const data = {
    export_date: new Date().toISOString(),
    entreprise: "Nysoa Construct",
    chantiers,
    journal
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `erp-nysoa-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}
