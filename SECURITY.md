# Security Policy — LEOGO DIGITAL MARKET

## Reporting a vulnerability

Please **do not post security vulnerabilities, access tokens, passwords, customer information, or proof-of-concept exploits in public issues or pull requests**.

If GitHub private vulnerability reporting is enabled, use the repository's **Security → Report a vulnerability** option. Otherwise, contact the repository owner privately through an established LEOGO business contact channel and request a secure way to share the details. Do not send credentials or customer data in an initial report.

Include only information necessary to reproduce the issue: affected feature, expected and actual behavior, approximate time, and minimal sanitized steps. Do not access records belonging to other people or perform invasive production tests.

## Supported version

The deployed production version from the protected `main` branch is the supported version. Experimental branches and staging environments are for internal testing.

## Handling security changes

- Triage reports privately and restrict access to sensitive evidence.
- Make the smallest necessary change on a separate branch.
- Test access control and regression paths on staging before merging.
- Keep customer checkout, payments, wallet, seller settlement, order delivery, and pickup workflows working.
- Review database authorization and Row Level Security with every privileged RPC or policy change.
- Keep service-role/secret API keys exclusively on the server; browser code may use only publishable/anon keys with RLS.
- Review the deployment and rollback procedure before applying production migrations.
- Do not disclose unpatched details publicly; coordinate disclosure after a fix is available.

## Maintainer checklist

- Require two-factor authentication on GitHub and Supabase owner accounts.
- Review `main` branch rules, collaborator privileges, and deployed environment secrets.
- Check Supabase security advisories periodically, distinguishing public catalogue RPCs from privileged account/payment operations.
- Maintain independent, access-controlled database backups and periodically test restoration using non-production data.
- Review free-plan limitations and avoid assuming that paid protection or automatic point-in-time recovery is available.

This policy documents reporting and maintenance practices; it does not itself enable GitHub branch protection, Supabase backups, or paid authentication features.
