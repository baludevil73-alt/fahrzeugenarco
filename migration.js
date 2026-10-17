export const STORAGE_KEY = 'narcoCityVehicles_v1';
export const categories = ['autos','lagerfahrzeuge','flugobjekte','zweiraeder','sonstige'];
export function normalize(v) {
  if (!v || typeof v !== 'object' || !categories.includes(v.category)) throw Error('Ungültige Fahrzeugkategorie.');
  const text = key => { if (v[key] != null && typeof v[key] !== 'string') throw Error('Ungültiges Textfeld: '+key); return (v[key] || '').trim(); };
  const price = v.purchasePrice == null || v.purchasePrice === '' ? null : Number(v.purchasePrice);
  if (price !== null && (!Number.isFinite(price) || price < 0)) throw Error('Ungültiger Kaufpreis.');
  const result = {category:v.category,type:text('type'),plate:text('plate'),info:text('info'),purchasePrice:price,image:text('image')};
  if (!result.type || result.type.length > 200 || result.plate.length > 80 || result.info.length > 10000) throw Error('Fahrzeugtyp fehlt oder Text ist zu lang.');
  if (result.image && !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/.test(result.image)) throw Error('Bild muss als PNG, JPEG, WebP oder GIF eingebettet sein. Externe Bilder werden nicht automatisch geladen.');
  if (result.image.length > 14*1024*1024) throw Error('Bild ist zu groß (maximal 10 MB).');
  return result;
}
export async function digest(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export function identity(v) { return v.plate ? v.category+'|'+v.plate.trim().toUpperCase() : ''; }
export async function prepareImport(input, existing) {
  const rows = Array.isArray(input) ? input : input?.vehicles;
  if (!Array.isArray(rows) || rows.length > 5000) throw Error('Ungültige Sicherung (maximal 5000 Fahrzeuge).');
  const seen = new Set(), known = new Map(existing.filter(v=>identity(v)).map(v=>[identity(v),v]));
  const plan = [];
  for (const source of rows) {
    const v = normalize(source);
    const imageHash = v.image ? await digest(v.image) : '';
    const key = await digest(JSON.stringify({...v,image:imageHash}));
    const match = known.get(identity(v));
    let status = seen.has(key) ? 'Doppelt in Datei' : existing.some(r=>r.import_key===key) ? 'Bereits importiert' : match ? 'Kennzeichen bereits vorhanden – prüfen' : 'Neu';
    if (status === 'Neu' && identity(v) && seen.has(identity(v))) status = 'Kennzeichen doppelt in Datei – prüfen';
    seen.add(key); if (identity(v)) seen.add(identity(v));
    plan.push({v,key,status});
  }
  return plan;
}
