# Third-party license overrides

Release metadata normally reads license text directly from each installed
production package. An override is permitted only when the published package
declares a recognized license but omits its license file.

`bash-language-server-5.6.0.txt` is the MIT license from upstream tag
`server-5.6.0` (commit `2fb9b33b6f40b508bf3b54233ff4efef0cb08206`):

<https://github.com/bash-lsp/bash-language-server/blob/server-5.6.0/LICENSE>

`scripts/generate-release-metadata.mjs` pins the normalized text with SHA-256
`291d324119550df1624f0af60388393fe36b02bc5e61d9a236afab1801b33042`.
Generation fails closed if the file is missing, changed, or referenced by a
different package version.

`tr46-0.0.3.txt` covers `tr46@0.0.3`, whose published manifest declares MIT
but whose package and matching `0.0.3` source tag omit the license file. The
text and copyright holder come from the upstream repository's MIT license:

<https://github.com/jsdom/tr46/blob/main/LICENSE.md>

The pinned normalized SHA-256 is
`499d6d466d064e0460427967a344e2a32fcb86ea8c6cd1a285ec4f1fa03fba67`.
