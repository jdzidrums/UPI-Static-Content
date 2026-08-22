APPROVED PUBLIC AUDIT DOWNLOADS

Only externally approved, appropriately redacted documents may be placed in this folder.

To publish a document:
1. Obtain written approval from the document owner, Legal/Privacy, and Information Technology.
2. Confirm whether an NDA or access control is required. Restricted documents do not belong in this static folder.
3. Remove secrets, customer data, internal-only findings, infrastructure details, and personal data as required.
4. Add the approved file under site/audits/.
5. Update site/data/trust-documents.json: set status to "published" and href to "audits/<filename>".
6. The CI validation will require the referenced file to exist before deployment.

Never publish a certification badge, audit report, or compliance claim before verification and approval.
