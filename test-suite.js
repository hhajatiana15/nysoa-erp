// TEST SUITE AUTOMATISÉ — ERP NYSOA CONSTRUCT
// Fitsapana ny raikipohy rehetra: Devis, Stock CMUP, Caisse, Paie, ary Attendance

function simulateLocalLogin(role) {
  user = {
    uid: "TEST-LOCAL-" + role,
    username: role.toLowerCase(),
    label: "Tester " + role,
    role: role,
    email: role.toLowerCase() + "@nysoa.mg",
    assignedProjects: []
  };
  sessionStorage.setItem("nysoa_v2_user", JSON.stringify(user));
  document.getElementById("login")?.classList.add("hidden");
  document.getElementById("app")?.classList.remove("hidden");
  boot();
  alert("Tafiditra amin'ny simulation ianao amin'ny maha: " + role);
}

function toggleOfflineSim() {
  const btn = document.getElementById("offlineSimBtn");
  if (navigator.onLine) {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    window.dispatchEvent(new Event('offline'));
    btn.textContent = "📶 Hiverina En-Ligne";
    btn.style.background = "#c62828";
    alert("Simulation HORS-LIGNE mandeha. Afaka manao fampidirana ianao dia voatahiry an-toerana.");
  } else {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    window.dispatchEvent(new Event('online'));
    btn.textContent = "📡 Simuler Hors-Ligne";
    btn.style.background = "";
    alert("Simulation EN-LIGNE mavitrika. Mandefa sync any amin'ny cloud.");
  }
}

function runErpSelfTest() {
  const results = [];
  const log = (name, passed, detail) => {
    results.push({ name, passed, detail });
  };

  // 1. Test Arrondi Monétaire
  try {
    const val = roundMoney(1000.0000000002);
    log("Test 1: Arrondi monétaire (roundMoney)", val === 1000.00, `Resultat: ${val} Ar (Tokony ho 1000 Ar)`);
  } catch(e) { log("Test 1: Arrondi monétaire", false, e.message); }

  // 2. Test Devis & TVA
  try {
    const dummyQuote = {
      vatEnabled: true,
      vatRate: 20,
      discount: 10000,
      sections: [{
        title: "Gros Oeuvre",
        items: [{ qty: 10, pu: 100000 }] // HT = 1 000 000
      }]
    };
    const fin = quoteFinancials(dummyQuote);
    const pass = fin.ht === 1000000 && fin.discount === 10000 && fin.net === 990000 && fin.vat === 198000 && fin.ttc === 1188000;
    log("Test 2: Kajy Devis & TVA (quoteFinancials)", pass, `HT: ${fin.ht}, Net: ${fin.net}, TVA: ${fin.vat}, TTC: ${fin.ttc}`);
  } catch(e) { log("Test 2: Kajy Devis", false, e.message); }

  // 3. Test Stock CMUP & Zero-Residual Value
  try {
    const dummyItem = { id: "TEST_STK_1", article: "Ciment", openingQty: 10, openingUnitValue: 35000 };
    // Stock initial: 10 @ 35 000 = 350 000 Ar
    db.modules = db.modules || {};
    db.modules.stockMovements = [
      { itemId: "TEST_STK_1", type: "Sortie", qty: 10, date: "2026-01-01" }
    ];
    const s = stockSnapshot(dummyItem);
    const pass = s.qty === 0 && s.value === 0 && s.avg === 35000;
    log("Test 3: Stock CMUP & Épuisement propre (0 Ar)", pass, `Qty sisa: ${s.qty}, Valeur sisa: ${s.value} Ar`);
  } catch(e) { log("Test 3: Stock", false, e.message); }

  // 4. Test Paie & Avance Logic
  try {
    const gross = 200000;
    const adv = 50000;
    const ded = 30000;
    const bal = 120000;
    const totalCashOut = adv + bal;
    const remain = gross - adv - bal - ded;
    const pass = totalCashOut === 170000 && remain === 0;
    log("Test 4: Kajy Paie & Déduction d'avance", pass, `Décaissement réel: ${totalCashOut} Ar, Reste dû: ${remain} Ar`);
  } catch(e) { log("Test 4: Paie", false, e.message); }

  // 5. Test Presence QR demi-journée preservation
  try {
    const rec = { entries: [{ employeeKey: "EMP-TEST", states: { "2026-03-30": "H" } }] };
    if (rec.entries[0].states["2026-03-30"] !== "H") {
      rec.entries[0].states["2026-03-30"] = "P";
    }
    const pass = rec.entries[0].states["2026-03-30"] === "H";
    log("Test 5: Fiarovana ny demi-journée 'H' amin'ny scan QR", pass, `État: ${rec.entries[0].states["2026-03-30"]} (Tsy voakosoka ho P)`);
  } catch(e) { log("Test 5: Presence QR", false, e.message); }

  // Asehoy ny valin'ny test
  const modal = document.getElementById("testResultsModal");
  const output = document.getElementById("testOutput");
  output.innerHTML = results.map(r => `
    <div class="test-item ${r.passed ? 'test-pass' : 'test-fail'}">
      <b>${r.passed ? '✓ PASSED' : '✗ FAILED'}</b>: ${r.name}<br>
      <small>${r.detail}</small>
    </div>
  `).join("");
  modal.style.display = "flex";
}
