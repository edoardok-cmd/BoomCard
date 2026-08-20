/**
 * Paysera's published callback-signing public key (BC-QA-031-FOLLOWUP-7).
 *
 * WHAT THIS IS
 * ------------
 * Paysera signs Checkout API callbacks with its own RSA private key and
 * publishes the matching public half at
 *   https://www.paysera.com/download/public.key
 * That URL serves a self-signed X.509 CERTIFICATE in PEM form (not a bare
 * SPKI "BEGIN PUBLIC KEY" block); the sandbox equivalent
 * (https://sandbox.paysera.com/download/public.key) serves a bare public key.
 * `PayseraService` accepts either shape — see `loadPublicKey()` there.
 *
 * WHY IT IS BUNDLED RATHER THAN FETCHED
 * -------------------------------------
 * Paysera's own PHP library (paysera/lib-webtopay, WebToPay_Factory::getSigner)
 * downloads this file over HTTPS before every callback verification. Doing that
 * would put a synchronous outbound request on the payment-callback hot path, so
 * we ship the key in the repo instead. A public key is not a secret, so
 * committing it is safe.
 *
 * PROVENANCE
 * ----------
 * Copied verbatim from the URL above on 2026-08-20. The identity of what is
 * bundled here is NOT left to this comment to assert: the certificate's SHA-256
 * fingerprint and the SHA-256 of its SubjectPublicKeyInfo DER are pinned by
 * executable assertions in `backend-api/tests/unit/paysera.service.test.ts`
 * ("bundled Paysera public key identity"). Those are the checkable claim — a
 * comment cannot re-run itself, and a silently wrong key here rejects every
 * genuine signed callback. If you replace the constant below, update those two
 * pinned digests in the same commit or the unit suite goes red.
 *
 * ROTATION
 * --------
 * Paysera will eventually rotate this key; the bundled certificate carries its
 * own expiry, which is where the timescale is authoritatively recorded.
 * Verification here uses only the embedded public key, never the certificate's
 * validity dates, so an expired certificate does NOT by itself break anything
 * — but a *rotated* key does: genuine callbacks would then be signed by a key
 * we do not hold, and under the default `PAYSERA_SS2_MODE=enforce` they would
 * be rejected. The operational levers, in preference order, are:
 *   1. `PAYSERA_PUBLIC_KEY_PATH=/path/to/public.key` — point at a mounted file
 *      holding the new key; no redeploy needed.
 *   2. `PAYSERA_PUBLIC_KEY='<PEM>'` — inline PEM (literal or \n-escaped).
 *   3. `PAYSERA_SS2_MODE=off` — break-glass: skip RSA verification entirely and
 *      fall back to the ss1 (MD5 + shared signing password) gate, which is the
 *      behaviour this codebase had before BC-QA-031-FOLLOWUP-7. Use only to end
 *      an outage, and re-provision a key straight after.
 *   4. Update the constant below and redeploy.
 */

/**
 * Live (www.paysera.com) callback-signing certificate, verbatim as published.
 */
export const PAYSERA_LIVE_PUBLIC_KEY_PEM = `-----BEGIN CERTIFICATE-----
MIICPjCCAacCFCMd/AKCGrBmBZhasIEkapgL3ah5MA0GCSqGSIb3DQEBCwUAMF4x
CzAJBgNVBAYTAkxUMRMwEQYDVQQIDApTb21lLVN0YXRlMRAwDgYDVQQHDAdWaWxu
aXVzMRMwEQYDVQQKDApQYXlzZXJhIExUMRMwEQYDVQQLDApQYXlzZXJhIExUMB4X
DTI1MDIwNTE0MDcyNloXDTI3MDIwNTE0MDcyNlowXjELMAkGA1UEBhMCTFQxEzAR
BgNVBAgMClNvbWUtU3RhdGUxEDAOBgNVBAcMB1ZpbG5pdXMxEzARBgNVBAoMClBh
eXNlcmEgTFQxEzARBgNVBAsMClBheXNlcmEgTFQwgZ8wDQYJKoZIhvcNAQEBBQAD
gY0AMIGJAoGBAN5PbdX+Q21/+Gs1p79mwt9Fl3wT6izodn0JuC8H5frn2QEMGrm+
MwMJWRjqyJyfV9wV+6i0RxuEpIoOsMBD4OYIyb3oLsDiCoILk6qYg1q7FgN1uJ7t
X0YladtFcOz/ky7vbZ/lO45QbceE3+9ODy4LEisYhi/2J2G9NsPKJ5ULAgMBAAEw
DQYJKoZIhvcNAQELBQADgYEALNB62C0eTuPAgrSgv/mZYKMZvQ+T97qUDZ2l/PG+
Oby2Ij1Uhut8w7BFnv7tcDQ+QLksvpcoJ6+Hge0iROVDLioLhUMDC/mz1TtC9kmP
d+n4PzdcllupdknJi5BbEucZcHpvHd2xJieWX+KzcZ1TorteF7xd2/Keo86ClZb0
M5s=
-----END CERTIFICATE-----
`;
