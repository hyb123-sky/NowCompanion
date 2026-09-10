import { ReferenceColumn, StringColumn, Table } from '@servicenow/sdk/core'
import config from '../../../now.config.json'

// OIDC identity resolution (ADR-0003 + its 2026-09-10 amendment). Key is the
// composite (idp_issuer, idp_subject), never a bare subject - a subject alone
// is not a key (a pairwise-subject IdP could reuse a value across issuers).
// Table name built from now.config.json's `scope` so the vendor prefix
// (ADR-0002) still appears in exactly one file.

const scope = config.scope

export const companion_user_map = Table({
    name: `${scope}_companion_user_map`,
    label: 'Companion User Map',
    schema: {
        sys_user: ReferenceColumn({
            label: 'ServiceNow user',
            mandatory: true,
            unique: true,
            referenceTable: 'sys_user',
        }),
        idp_issuer: StringColumn({
            label: 'IdP issuer',
            mandatory: true,
            maxLength: 255,
            hint: 'The OIDC issuer URL. Entra ID is the first tested IdP.',
        }),
        idp_subject: StringColumn({
            label: 'IdP subject',
            mandatory: true,
            maxLength: 255,
            hint: `Deployment precondition (ADR-0003 amendment): the IdP must issue a subject that is stable across applications for the same human. Entra ID's oid claim satisfies this; a plain OIDC sub claim may not (some IdPs issue pairwise subjects - a different value per client for the same user). If the deployed IdP cannot guarantee this, identity resolution is not correct for it.`,
        }),
    },
    index: [
        {
            name: 'idx_companion_user_map_idp',
            unique: true,
            element: ['idp_issuer', 'idp_subject'],
        },
    ],
})
