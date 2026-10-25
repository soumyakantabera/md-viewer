# Code signing (removing "Unknown publisher")

Windows shows **"Unknown publisher"** and a SmartScreen warning for any installer that is not
digitally signed with a certificate from a trusted certificate authority (CA).
A `.reg` file, an `author` field, or a self-signed certificate cannot fix this for other people.
The author name in `package.json` only fills in the file properties and "Installed apps" entry.

## Options

| Option | Cost | Notes |
|---|---|---|
| **SignPath Foundation** | Free for qualifying open-source projects | Apply at signpath.org; project must be public, OSI-licensed (MIT is fine) and build via CI |
| **Azure Trusted Signing** (Microsoft) | Roughly $10 / month | Eligibility depends on country and identity checks; supported by recent the build versions (`azureSignOptions`) |
| **OV code-signing certificate** | About $100-400 / year | Shows your verified name; SmartScreen reputation builds up over time |
| **EV code-signing certificate** | About $250-500 / year | Hardware token; best SmartScreen reputation from the start |
| **Microsoft Store (MSIX)** | One-time developer fee (about $19 for individuals) | Store signs the package; no SmartScreen warning. Needs an `appx` build target |

Prices and eligibility change, so check each provider before buying.

## Signing with a certificate file (.pfx)

1. Get a `.pfx` (or `.p12`) certificate issued to **Soumyakanta Bera**.
2. In GitHub, go to Settings > Secrets and variables > Actions and add:
   - `CERT_BASE64`: the base64 of your `.pfx` (`certutil -encode cert.pfx cert.b64` on Windows, `base64 -w0 cert.pfx` on Linux)
   - `CERT_PASSWORD`: the certificate password
3. Push a tag such as `v1.3.1`. The workflow signs the installer with `osslsigncode` and timestamps it.
   With no secrets set, it builds an unsigned installer as before.

Manual signing on Windows: `signtool sign /f cert.pfx /p PASSWORD /tr http://timestamp.digicert.com /td sha256 /fd sha256 MD-Viewer-Setup.exe`
(sign `mdviewer.exe` first, then rebuild the installer, for the best result).

## Only for your own PC

A self-signed certificate can be created and trusted locally so *your* machine stops warning,
but every other PC will still show "Unknown publisher".
