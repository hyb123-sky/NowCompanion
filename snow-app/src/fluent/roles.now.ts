import { Role } from '@servicenow/sdk/core'
import config from '../../now.config.json'

// Declared explicitly so they are reproducible from source. The platform
// had already auto-generated an end-user role derived from a truncated app
// name (see docs/servicenow-compatibility.md) - this replaces that with a
// name that actually matches the scope. Role name is built from
// now.config.json's `scope` field rather than hardcoded here, so the
// temporary vendor prefix (ADR-0002) still appears in exactly one file.

const scope = config.scope

export const userRole = Role({
    $id: Now.ID['role.user'],
    name: `${scope}.user`,
    description: 'End-user role: minimum access to interact with the NowCompanion companion client.',
    grantable: true,
})

export const adminRole = Role({
    $id: Now.ID['role.admin'],
    name: `${scope}.admin`,
    description: 'Application administrator for the NowCompanion scoped app.',
    scoped_admin: true,
    grantable: true,
})

export const integrationRole = Role({
    $id: Now.ID['role.integration'],
    name: `${scope}.integration`,
    description:
        'Least-privilege role for the Gateway integration user (OAuth client_credentials). Read/write on the companion_* tables only - never itil, never direct incident/change_request/sys_user access. See CLAUDE.md non-negotiable #4; ATF proof of this restriction is a PR-6 deliverable.',
    grantable: false,
})
