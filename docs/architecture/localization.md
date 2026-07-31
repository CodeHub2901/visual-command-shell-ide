# Localization boundary

English is the only locale shipped for the Linux v1, but UI copy is separated
from application state and product behavior.

The canonical catalog is
`apps/desktop/src/shared/messages/en.ts`. Its literal keys define the
`MessageId` union. Every additional locale must implement the complete
`MessageCatalog` type, so missing keys fail typechecking. The shared
`localization.ts` module provides:

- exact and language-subtag locale resolution with English fallback;
- safe named-value interpolation that rejects missing values;
- `Intl.PluralRules` selection;
- locale-aware number, date/time, and time formatting.

The React-only `I18nProvider` selects from `navigator.languages`, sets the
document language, and exposes a stable translator through `useI18n`.
Workspace state uses stable locale-neutral IDs rather than translated labels.
React Flow labels, catalog completion/hover text, visual-mutation errors,
terminal status/output notices, asynchronous fallbacks, and accessibility
attributes all receive the translator explicitly.

Electron main selects from Electron's preferred system languages after
`app.whenReady()`. Native import/export/directory dialogs and main-process
errors use the same shared catalog. Localization therefore does not add an IPC
method, expose the filesystem, or change the renderer's trust boundary.

`i18n.test.ts` verifies fallback, interpolation, plural choice, and formatting.
It also scans renderer presentation sources, localized helper producers, and
native-dialog definitions to prevent new inline UI strings. English catalog
changes should update those tests and preserve placeholder names for every
future catalog.
