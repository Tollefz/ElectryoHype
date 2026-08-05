const fs = require("fs");
const j = JSON.parse(fs.readFileSync("tmp-rc-dry-run.json", "utf8"));
let freight = 0,
  price = 0,
  margin = 0,
  variant = 0,
  other = 0;
for (const [k, v] of Object.entries(j.buckets)) {
  if (k === "would_publish") continue;
  if (String(k).includes("Frakt")) freight += Number(v);
  else if (String(k).includes("Innkjøpspris")) price += Number(v);
  else if (String(k).includes("Ny margin")) margin += Number(v);
  else if (String(k).includes("Variant")) variant += Number(v);
  else other += Number(v);
}
console.log(
  JSON.stringify(
    {
      wouldPublish: j.wouldPublish,
      wouldStop: j.wouldStop,
      freight,
      price,
      margin,
      variant,
      other,
      sum: freight + price + margin + variant + other,
      elapsedMin: Math.round(j.elapsedSec / 6) / 10,
      ppm: j.ppm,
    },
    null,
    2
  )
);
