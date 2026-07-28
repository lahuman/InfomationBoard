import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import {
  ACCESS_COOKIE_NAME,
  verifyAccessToken,
} from "@/features/boards/access/access-cookie";
import { PasswordChallenge } from "@/features/boards/access/password-challenge";
import { getPasswordBoardBySlug } from "@/features/boards/access/password-board";
import { verifyPasswordAccess } from "@/features/boards/access/verify-password";
import { PublicBoardView } from "@/features/boards/public/public-board-view";
import { getPublicBoardBySlug } from "@/features/boards/public/queries";
import { getServerEnv } from "@/lib/env/server";

type PublicBoardPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PublicBoardPageProps): Promise<Metadata> {
  const { slug } = await params;
  const board = await getPublicBoardBySlug(slug);

  if (!board) {
    const protectedBoard = await getPasswordBoardBySlug(slug);
    if (protectedBoard) {
      noStore();
      return {
        title: "비밀번호로 보호된 안내판",
        alternates: { canonical: `/b/${protectedBoard.board.slug}` },
        robots: { index: false, follow: false },
      };
    }
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

  if (board) return <PublicBoardView board={board} />;

  const protectedBoard = await getPasswordBoardBySlug(slug);
  if (!protectedBoard) notFound();

  noStore();
  const token = (await cookies()).get(ACCESS_COOKIE_NAME)?.value;
  const hasAccess = verifyAccessToken(
    token,
    {
      boardId: protectedBoard.board.id,
      secretVersion: protectedBoard.secretVersion,
    },
    getServerEnv().SUPABASE_SECRET_KEY,
  );

  return hasAccess ? (
    <PublicBoardView board={protectedBoard.board} />
  ) : (
    <PasswordChallenge
      slug={protectedBoard.board.slug}
      verifyAction={verifyPasswordAccess}
    />
  );
}
