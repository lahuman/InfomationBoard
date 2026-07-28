import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicBoardView } from "@/features/boards/public/public-board-view";
import { getPublicBoardBySlug } from "@/features/boards/public/queries";

type PublicBoardPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PublicBoardPageProps): Promise<Metadata> {
  const { slug } = await params;
  const board = await getPublicBoardBySlug(slug);

  if (!board) {
    return {
      title: "안내판을 찾을 수 없습니다",
      robots: { index: false, follow: false },
    };
  }

  const canonicalPath = `/b/${board.slug}`;
  const description = board.summary || undefined;

  return {
    title: board.title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      type: "article",
      title: board.title,
      description,
      url: canonicalPath,
      publishedTime: board.publishedAt,
      modifiedTime: board.updatedAt,
    },
    robots: {
      index: board.allowIndexing,
      follow: board.allowIndexing,
    },
  };
}

export default async function PublicBoardPage({
  params,
}: PublicBoardPageProps) {
  const { slug } = await params;
  const board = await getPublicBoardBySlug(slug);

  if (!board) notFound();
  return <PublicBoardView board={board} />;
}
