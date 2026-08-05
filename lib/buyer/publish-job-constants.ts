export const BUYER_PUBLISH_JOB_KEY = "buyer_publish_job";
/** Same pipeline as publish — separate Setting so republish can run without clobbering hunt publish. */
export const BUYER_REPUBLISH_JOB_KEY = "buyer_republish_job";

export type BuyerPublishJobKind = "publish" | "republish";

export function publishJobSettingKey(
  kind: BuyerPublishJobKind = "publish"
): string {
  return kind === "republish"
    ? BUYER_REPUBLISH_JOB_KEY
    : BUYER_PUBLISH_JOB_KEY;
}
