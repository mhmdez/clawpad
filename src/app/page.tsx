import { redirect } from "next/navigation";
import { isWorkspaceBootstrapped } from "@/lib/files";

export default async function Home() {
  const hasWorkspace = await isWorkspaceBootstrapped();

  if (!hasWorkspace) {
    redirect("/setup");
  }

  redirect("/workspace");
}
