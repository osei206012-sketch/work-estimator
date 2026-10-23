
export const handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  };

  const reply = (statusCode, data) => ({
    statusCode,
    headers,
    body: JSON.stringify(data)
  });

  if (event.httpMethod !== "POST") {
    return reply(405, { error: "POST requests only." });
  }

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  const siteUrl = process.env.SITE_URL;

  if (!secretKey || !siteUrl) {
    return reply(500, {
      error: "Payment configuration is missing."
    });
  }

  let body;

  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return reply(400, { error: "Invalid request." });
  }

  const email =
    typeof body.email === "string" ? body.email.trim() : "";

  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return reply(400, {
      error: "Please provide a valid email address."
    });
  }

  let baseUrl;

  try {
    baseUrl = new URL(siteUrl);
    if (baseUrl.protocol !== "https:") {
      return reply(500, {
        error: "The website URL must use HTTPS."
      });
    }
  } catch {
    return reply(500, {
      error: "The website URL is invalid."
    });
  }

  try {
    const response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          amount: 15000,
          currency: "GHS",
          callback_url: new URL(
            "/?payment=return",
            baseUrl.origin
          ).toString()
        })
      }
    );

    const result = await response.json();

    if (
      !response.ok ||
      !result.status ||
      !result.data?.authorization_url ||
      !result.data?.reference
    ) {
      return reply(502, {
        error: "Paystack could not start checkout. Please try again."
      });
    }

    return reply(200, {
      authorization_url: result.data.authorization_url,
      reference: result.data.reference
    });
  } catch {
    return reply(502, {
      error: "Unable to connect to Paystack. Please try again."
    });
  }
};
