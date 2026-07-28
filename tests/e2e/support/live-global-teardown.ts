import { deleteRememberedOwner } from "./live-owner";

export default async function liveGlobalTeardown() {
  await deleteRememberedOwner();
}
