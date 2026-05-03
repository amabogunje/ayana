export async function GET() {
  return new Response(
    `<!doctype html><html><head><title>Deposit not completed</title><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body style="font-family: system-ui, sans-serif; padding: 32px;"><h1>Deposit not completed</h1><p>No payment was captured. You can return to chat and try again.</p></body></html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    },
  );
}
