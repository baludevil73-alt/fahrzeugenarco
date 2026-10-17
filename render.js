function escapeHtml(text){
  return String(text ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function placeholder(){
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="180" height="116">
      <rect width="100%" height="100%" fill="#071a33"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
            font-family="Arial" font-size="16" fill="#f2c94c">Kein Bild</text>
    </svg>
  `);
}

function updateSummary(vehicles){
  const categories = ["autos","lagerfahrzeuge","flugobjekte","zweiraeder","sonstige"];
  categories.forEach(category => {
    const count = vehicles.filter(v => v.category === category).length;
    const el = document.getElementById("summary-" + category);
    if(el) el.textContent = count;
  });
  document.getElementById("summary-total").textContent = vehicles.length;
}

function render(vehicles, unlocked){
  ["autos","lagerfahrzeuge","flugobjekte","zweiraeder","sonstige"].forEach(category => {
    const tbody = document.getElementById(category);
    const rows = vehicles.filter(v => v.category === category);
    tbody.innerHTML = "";

    if(!rows.length){
      tbody.innerHTML = `<tr><td colspan="${unlocked ? 6 : 5}" class="empty">Noch keine Einträge vorhanden.</td></tr>`;
    } else {
      rows.forEach(v => {
        const tr = document.createElement("tr");
        tr.dataset.id = v.id;
        tr.innerHTML = `
          <td class="img-cell">
            <img class="vehicle-img" src="${escapeHtml(v.image || placeholder())}" alt="Fahrzeugbild">
            <input type="file" accept="image/*" hidden class="row-image-input">
          </td>
          <td contenteditable="false" data-field="type">${escapeHtml(v.type)}</td>
          <td contenteditable="false" data-field="plate">${escapeHtml(v.plate)}</td>
          <td>${escapeHtml(v.purchasePrice == null ? "—" : Number(v.purchasePrice).toLocaleString("de-DE"))}</td>
          <td contenteditable="false" data-field="info">${escapeHtml(v.info)}</td>
          <td class="table-actions" ${unlocked ? "" : "hidden"}>
            <button class="small-btn edit-btn" type="button" data-action="edit">Bearbeiten</button>
            <button class="small-btn image-btn" type="button" data-action="image">Bild ändern</button>
            <button class="small-btn delete-btn" type="button" data-action="delete">Löschen</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    document.getElementById("count-"+category).textContent =
      rows.length + (rows.length === 1 ? " Eintrag" : " Einträge");
  });
  updateSummary(vehicles);
  document.querySelectorAll("[data-editor-only]").forEach(node => { node.hidden = !unlocked; });
}


export {render};
