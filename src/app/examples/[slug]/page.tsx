import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SampleBoardPageView } from "@/features/boards/examples/sample-board-page";
import {
  SAMPLE_BOARD_SLUGS,
  getSampleBoard,
} from "@/features/boards/examples/sample-boards";

type ExampleBoardPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return SAMPLE_BOARD_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: ExampleBoardPageProps): Promise<Metadata> {
  const sample = getSampleBoard((await params).slug);

  if (!sample) {
    return {
      title: "활용 예시를 찾을 수 없습니다",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `${sample.board.title} · 활용 예시`,
    description: sample.board.summary,
    robots: { index: false, follow: false },
  };
}

export default async function ExampleBoardPage({
  params,
}: ExampleBoardPageProps) {
  const sample = getSampleBoard((await params).slug);
  if (!sample) notFound();

  return <SampleBoardPageView sample={sample} />;
}
