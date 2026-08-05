import { approveAndPublishCandidates } from "../lib/buyer/approve-and-publish";

const id = process.argv[2] || "cms6mn4bp00j0vff49xp91x4v";
const dry = process.argv[3] !== "live";

async function main() {
  const result = await approveAndPublishCandidates({
    ids: [id],
    dryRun: dry,
    limit: 1,
    actorEmail: "diag@local",
  });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
