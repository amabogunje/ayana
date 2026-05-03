import { WebsiteChatWidget } from "@/components/website-chat-widget";

export default async function WebsiteChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ widgetKey: string }>;
  searchParams: Promise<{ origin?: string }>;
}) {
  const { widgetKey } = await params;
  const query = await searchParams;

  return <WebsiteChatWidget widgetKey={widgetKey} origin={query.origin} />;
}
