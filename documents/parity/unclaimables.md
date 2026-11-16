# The un-claimables register

The MVP release claim covers what was compared, and this is the list of what it does not cover - kept as a
register rather than a memory. Every row names what is unproven, why it is accepted, and what would close
it. `tests/meta/parity-claim.test.ts` fails when a row loses a field or when a surface the pack calls
"not claimable" is missing here.

| Surface or item                                                   | What is unproven                                                                                    | Why it is accepted                                                  | What would close it                                                    |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| member detail (`#/members/:memberNo`)                             | every tab, the shepherding panel and the contact actions have never been compared against a drawing | no signed mock exists for the screen; it shipped on the spec alone  | a signed mock for the detail, then a capture compared against it       |
| add and edit member (`#/members/new`, `#/members/:memberNo/edit`) | form layout, validation placement and the save affordances are uncompared                           | no signed mock; the form is covered by DOM and e2e tests only       | a signed mock for the form's idle and error states                     |
| contacts dialog                                                   | the dialog's shape and its empty state are uncompared                                               | no signed mock; the build follows FR-59's action-and-count rule     | a signed mock for the dialog                                           |
| attendance dialog (event detail)                                  | the mark-attendance dialog is uncompared                                                            | no signed mock; the surface is exercised end to end but never drawn | a signed mock, then a capture                                          |
| import batch list (`#/imports/batches`)                           | the batch rows and their statuses are uncompared                                                    | the API has no batch-list contract to draw against (OS-4)           | the API contract, then a mock                                          |
| the USSD simulator                                                | nothing about this screen is compared, and it has no mock of its own                                | it is a development-only screen; the release claim excludes it      | a signed mock, or its removal from the shipped navigation              |
| nine legacy prototype captures                                    | they predate the build and have no live source, so they can be neither re-cut nor compared          | the DoD names them outside parity                                   | re-drawing each on the shared shell, or deleting them from the archive |

## The one that is not a surface

The flaky deep-link e2e assertion is the one item here that is a gate risk rather than a surface. Under the
repo's two-rerun rule a third failure parks the round, so an assertion that fails intermittently can stop a
release just as hard as an uncompared screen. It is closed by fixing the assertion, or by recording it as a
known flake with its own ticket.
