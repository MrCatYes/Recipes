import { normalize } from "../utils/normalize";
function rm(name: string, includes: string[]) {
  const n = normalize(name);
  for (const inc of includes) { if (n.includes(normalize(inc))) return true; }
  return false;
}
console.log("sel:", rm("1 pincee Sel", ["sel"]));
console.log("cv:", rm("citrons verts", ["citrons verts"]));
console.log("esp:", rm("piment d Espelette", ["piment d espelette"]));
console.log("erable:", rm("sucre d erable", ["sucre d erable"]));
console.log("poivre:", rm("Poivre au gout", ["poivre"]));
