import { PageEditor } from "@/components/editor/page-editor";

interface PageEditorPageProps {
  params: Promise<{ path: string[] }>;
}

export default async function PageEditorPage({ params }: PageEditorPageProps) {
  const { path } = await params;
  const pagePath = path.join("/");

  return <PageEditor path={pagePath} />;
}
