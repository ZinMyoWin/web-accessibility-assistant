# Account and preferences UI functions

This guide explains the inspected page handlers and components for account access and preferences. The page components collect input and display state; authentication and persistence are delegated to the [auth and preferences functions](frontend-auth-preferences-functions.md). Client-side checks improve feedback but do not replace backend validation.

## Account pages

The [auth layout](<../../frontend/src/app/(auth)/layout.tsx>) wraps its pages in [AuthShell](../../frontend/src/components/auth/AuthShell.tsx). The shell presents navigation and example content; it does not load a real report. Each form prevents duplicate submission while its `submitting` state is true and displays errors through `AuthAlert`.

| Page and handler | Inputs and validation | Calls, results, and failure states |
| --- | --- | --- |
| [Login](<../../frontend/src/app/(auth)/login/page.tsx>): `LoginForm.handleSubmit(event)` | Controlled email, password and remember flag. It tests a simple email pattern and requires a nonempty password. The form uses `noValidate`, so these checks provide the immediate messages. | Calls `useAuth().signIn(email, password, remember)`; on success navigates with `router.replace` to `callbackUrl` from the query or `/dashboard`. On rejection displays the message and re-enables submission. `LoginPage` provides Suspense around query access. |
| [Register](<../../frontend/src/app/(auth)/register/page.tsx>): `handleSubmit(event)` | Requires a trimmed name of at least two characters, a matching email, at least eight password characters, and the terms checkbox. | Calls `signUp`, then a separate `signIn` with remember enabled, then navigates to dashboard. A failure of either step is shown as an error; account creation could already have succeeded when the subsequent sign-in fails. The terms and privacy links currently point to `#`; the acceptance flag is checked in this page and is not passed to `signUp`. |
| [Forgot password](<../../frontend/src/app/(auth)/forgot-password/page.tsx>): `handleSubmit(event)` | Email matching the same simple pattern. | Calls `requestPasswordReset(email)`, displays the returned confirmation or an error, and always clears submitting. The helper sends a backend request; the page does not send email itself. |
| [Reset password](<../../frontend/src/app/(auth)/reset-password/page.tsx>): `ResetPasswordForm.handleSubmit(event)` | Reads the query token; a missing token displays an error instead of the form. Requires a password of at least eight characters. | Calls `resetPassword(token, password)`. Success sets done and schedules navigation to login after 1.5 seconds; failure displays an error and re-enables the form. `ResetPasswordPage` wraps the form in Suspense. |
| [Legacy signup](../../frontend/src/app/signup/page.tsx): `AuthCard.handleSubmit(event)` | The [AuthCard](../../frontend/src/components/auth/AuthCard.tsx) receives `mode`, uses browser required/minimum-length attributes, and renders name for signup. | Calls context signup or login, then shows success and schedules a dashboard redirect after 900 ms. Errors are displayed; unlike the newer register form, the card has no terms checkbox and does not make a second explicit sign-in call after signup. |

The login page passes the query's callback value to the router; this guide does not establish all possible navigation validation or NextAuth redirect behavior. Google buttons on login and registration are separate from each page's email-form submit handler. In particular, the registration checkbox check is in that form handler, not in the Google button callback.

## Shared account components

- [PasswordField](../../frontend/src/components/auth/PasswordField.tsx) takes label, controlled `value`, `onChange`, autocomplete, optional hint/required/disabled state and children. Its local visibility toggle switches the input type and updates accessible label/pressed state without changing the password. The parent owns the value.
- [PasswordStrengthMeter](../../frontend/src/components/auth/PasswordStrengthMeter.tsx) takes a value and hint ID. Private `scorePassword` awards up to three points: length at least eight; both ASCII letters and a digit; and a non-alphanumeric character with length at least ten. It renders visual feedback and a hint; it does not block submission or enforce backend password policy.
- [GoogleButton](../../frontend/src/components/auth/GoogleButton.tsx) takes a label, optional callback URL and optional error callback. `handleClick` sets loading and awaits `signInWithGoogle`; a rejected start clears loading and reports a general error. Successful navigation is expected to redirect. Provider registration and backend exchange are described in the [auth function guide](frontend-auth-preferences-functions.md#nextauth-provider-and-callbacks).
- [AuthSegmentedControl](../../frontend/src/components/auth/AuthSegmentedControl.tsx) renders links for login and registration; `/signup` marks registration active. [AuthAlert](../../frontend/src/components/auth/AuthAlert.tsx) renders assertive errors or polite success messages. These components do not make API requests.

## Preferences page: draft and save

[PreferencesPage](<../../frontend/src/app/(dashboard)/preferences/page.tsx>) reads `preferences`, `isLoading` and operations from context. It stores a separate draft, dirty flag, active section and toast. Its effect copies context preferences into the draft whenever preferences change and the draft is not dirty; while loading or without a draft, it shows a loading message. It does not render the context's load-error field.

| Callback | Input and behavior | Side effects / limits |
| --- | --- | --- |
| `updateDraft(update)` | Takes partial preferences, shallow-merges them into an existing draft and marks it dirty. Passed to each editing section. | No API call occurs until Save. |
| `handleSave()` | If a draft exists, awaits `updatePreferences(draft)`, clears dirty and shows success; catches failure and shows a generic failure toast. | The context sends authenticated `PUT /preferences`. The page has no explicit save-in-flight guard; an edit made during a slow save may be overwritten when that earlier save resolves and the clean-draft effect copies returned preferences. |
| `handleDiscard()` | Replaces the draft with current context preferences and clears dirty. | Local change only; it does not undo a completed backend update. |
| `scrollToSection(id)` | Sets active section and asks the matching DOM element to scroll smoothly into view. | Used by [PreferencesNav](../../frontend/src/components/preferences/PreferencesNav.tsx); active selection follows clicks, not an observed scroll position. |
| `showToast(message)` | Shows a message, replacing any existing timer, then clears it after 2.8 seconds. | Local UI state. |

[SaveBar](../../frontend/src/components/preferences/SaveBar.tsx) receives `dirty`, `onSave`, and `onDiscard`; it shows save/discard controls only while dirty. [SectionCard and FieldRow](../../frontend/src/components/preferences/SectionCard.tsx) are reusable layout/label wrappers and do not persist data.

## Preference section callbacks

The AI, crawl, WCAG, notification and appearance sections receive the current `draft` and `updateDraft(partial)`. Their changes are persisted after Save. The Danger Zone instead invokes separate actions after confirmation, as described below.

### AI provider

[AiProviderSection](../../frontend/src/components/preferences/AiProviderSection.tsx) selects a displayed provider, model, active suggestion provider, automatic-generation flag and API key. Choosing a provider also selects the first model listed for that provider. Typing a key sends `{api_key: value, clear_api_key: false}` to the draft; Clear sends an empty key plus `clear_api_key: true`. The context omits an unchanged blank replacement key unless explicit clearing is requested; see the [key handling reference](frontend-auth-preferences-functions.md#updatepreferencesnewprefs-and-api-key-handling). The section's “Connected” marker follows the selected active provider value; it is not a live connectivity check.

### Crawl defaults

[CrawlDefaultsSection](../../frontend/src/components/preferences/CrawlDefaultsSection.tsx) changes scan mode, numeric limits/delays, ignored URL patterns and domain/robots/crawl-memory switches. `handleTagKeyDown(event)` adds a trimmed, comma-stripped pattern on Enter or comma, and removes the last saved pattern on Backspace when the input is empty. `removeTag(index)` filters the indexed pattern. It does not deduplicate patterns.

Numeric inputs declare HTML minimum/maximum values. Their change callbacks convert text with `Number`; the page-limit callback caps values at five but does not itself clamp the lower bound, while the other numeric callbacks do not clamp their ranges. The backend must validate submitted values. The section offers a `sitemap` default, but the inspected [dashboard page](<../../frontend/src/app/(dashboard)/dashboard/page.tsx>) maps only `multi` to multi-page mode and treats other values as single-page mode; selecting that option here does not establish an implemented sitemap workflow.

### WCAG and notifications

[WcagStandardSection](../../frontend/src/components/preferences/WcagStandardSection.tsx) derives a displayed version and level from the stored standard string. `updateStandard(version, level)` removes the decimal point, lowercases the level and writes a combined value such as `wcag21aa`; version/level buttons call it with the other current selection. A switch updates `include_best_practices`. The controls select settings; they do not themselves perform or certify WCAG checks.

[NotificationsSection](../../frontend/src/components/preferences/NotificationsSection.tsx) updates completion, failure, high-severity and score-threshold switches. `clampThreshold(number)` maps NaN to zero and otherwise rounds and clamps to 0–100. `toggleSeverity(severity)` adds or removes the selected severity from the draft array. These controls do not themselves send messages. The dashboard's [notification evaluator](../../frontend/src/lib/scan-notifications.ts) uses its specified terminal-event preferences and triggers a score notice at or below the threshold; its observed inputs do not include the `notify_severities` array. Do not infer that every saved notification setting has an implemented delivery effect.

### Appearance and destructive actions

[AppearanceSection](../../frontend/src/components/preferences/AppearanceSection.tsx) writes theme and lowercased density, and its animation switch writes the inverse to `reduced_motion`. The inspected dashboard passes `!reduced_motion` to its scan-notification component. Selecting a theme or density in this section alone does not prove it is applied globally.

[DangerZoneSection](../../frontend/src/components/preferences/DangerZoneSection.tsx) receives `onClearHistory`, `onResetPreferences`, and `onToast`. Each action has a confirmation dialog. Confirming calls the supplied asynchronous action and reports success or failure through a toast. The page delegates clearing to context `clearScanHistory()` and resetting to `resetPreferences()`; on successful reset it also clears dirty so the draft can synchronize to the returned defaults. The dialogs close through their controls while the operation runs. The backend owns actual deletion and reset semantics.

## Testing and coverage limits

Relevant existing tests include [authentication accessibility](../../frontend/src/components/auth/AuthAccessibility.test.tsx), [login browser checks](../../frontend/e2e/auth-login.spec.ts), [AI provider controls](../../frontend/src/components/preferences/AiProviderSection.test.tsx), and [notification controls](../../frontend/src/components/preferences/NotificationsSection.test.tsx). They cover selected interactions, not every submission, save race, live OAuth exchange or backend validation path.

This guide inspects the listed account pages, their shared account components, the preferences page and listed sections. It does not exhaustively review Radix component internals, all CSS and visual states, backend validation/delivery, every preference consumer, third-party OAuth internals, or live browser/network behavior. Those areas remain unverified.
