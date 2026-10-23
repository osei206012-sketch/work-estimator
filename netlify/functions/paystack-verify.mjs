
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

  if (!secretKey) {
    return reply(500, {
      error: "Payment verification is not configured."
    });
  }

  let body;

  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return reply(400, { error: "Invalid request." });
  }

  const reference =
    typeof body.reference === "string"
      ? body.reference.trim()
      : "";

  if (
    !reference ||
    reference.length > 100 ||
    !/^[A-Za-z0-9._=-]+$/.test(reference)
  ) {
    return reply(400, {
      error: "A valid transaction reference is required."
    });
  }

  try {
    const response = await fetch(
      "https://api.paystack.co/transaction/verify/" +
        encodeURIComponent(reference),
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKey}`
        }
      }
    );

    const result = await response.json();

    if (!response.ok || !result.status || !result.data) {
      return reply(502, {
        error: "Could not verify this payment. Please try again."
      });
    }

    const transaction = result.data;

    if (
      transaction.status !== "success" ||
      transaction.currency !== "GHS" ||
      transaction.amount !== 15000
    ) {
      return reply(400, {
        verified: false,
        error: "Payment is not confirmed for the required amount."
      });
    }

    return reply(200, {
      verified: true,
      reference: transaction.reference,
      message: "Payment verified. Subscription activation is not yet implemented."
    });
  } catch {
    return reply(502, {
      error: "Unable to verify payment right now. Please try again."
    });
  }
};
