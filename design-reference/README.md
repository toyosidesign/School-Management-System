# Design reference

Drop mockups here for the public website. Anything in this folder is a reference
only: it is never served, bundled or deployed.

## What is taken from a mockup

**Structure and information architecture only.** Colour, type, spacing and styling
are deliberately ignored; those come from the existing design system and from
whatever branding each school sets at /admin/website.

Taken:

- **Page inventory** - which pages a school site needs
- **Section order** - what appears on each page, and in what sequence
- **Content model** - what each section actually holds, down to the field level
  (a staff card is name + role + photo + bio; a fee row is section + amount + what is included)
- **Navigation** - grouping and labels in the header and footer
- **Forms** - which fields are asked for, which are required
- **Anything missing** - sections the current site does not have at all

Ignored:

- Colours, gradients, fills
- Fonts, type scale, weights
- Spacing, radii, shadows, borders
- Imagery style, icons, animation

## Where it lands

Nothing gets hardcoded. New sections become editable blocks in the `site_content`
table, so a school can change the words without touching code:

| From the mockup | Becomes |
|---|---|
| A new section on a page | A `site_content` row (`page` + `slot`), seeded with sensible default copy |
| Repeating cards in that section | The `extra` JSON array on that row, edited under Website > Page content |
| A whole new page | A route in `client/src/pages/site/`, plus its content rows and a nav entry |
| New form fields | Columns on `admissions_enquiries`, shown in the admin inbox |

The result keeps working for any school: same structure, their colour, logo and words.
