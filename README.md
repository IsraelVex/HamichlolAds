# HamichlolAds

A MediaWiki extension that shows Taboola ads on [Hamichlol](https://www.hamichlol.org.il) in slots
that the site places and controls. Taboola only fills the slots; which pages get ads, where, and in
what size is decided by this extension.

The extension does not set cookies, does not handle consent, does not track users, and adds no
database tables.

## Requirements

- MediaWiki 1.46 or later.
- Hamichlol's Portal namespace (ID 4000) for the `category` page type.
- For `$wgHamichlolAdsHideOnShabbat`: Hamichlol's Shabbat lock, which is locked with reason 'המכלול נעול לעריכה בשבת ומועדי ישראל'.

## Installation

1. Place this directory at `extensions/HamichlolAds`.
2. Add to `LocalSettings.php`:
   ```php
   wfLoadExtension( 'HamichlolAds' );
   $wgHamichlolAdsEnabled = true;
   ```
3. Create the wiki pages described under [Wiki setup](#wiki-setup).

## How it works

For every page view, the server decides whether the page gets ads. It does when all of the following hold:

- `$wgHamichlolAdsEnabled` is `true`;
- the page is the main page, a portal or an article;
- it is a plain view of the current version of an existing page that is not a redirect
  (not an edit, history, old revision, diff or printable version);
- the page is not in the category `$wgHamichlolAdsExcludeCategory`;
- when `$wgHamichlolAdsHideOnShabbat` is `true`, it is not Shabbat or a holiday;
- the viewer is not exempt (see [User rights and preferences](#user-rights-and-preferences)).

When it does, the server adds Taboola's loader to the page head, a `feed` slot after the content
(with an icon that links to the [ads policy](#ads-policy-link)), and the `ext.hamichlolAds` module.
When it does not, nothing from Taboola is added to the page.

In the browser, the module adds the automatic slots in articles, maps each slot to a Taboola unit
for the current platform (the Minerva skin is mobile, any other skin is desktop), and passes the
units to Taboola.

The decision is made on every page view, after parsing, so the parser cache is shared by all users.
It requires that page HTML for logged-in users is not stored in a shared cache, which is
MediaWiki's default behaviour.

## Slots

A slot is an empty `<div class="hm-ad-slot" data-slot="NAME">`. Slots come from three sources:

1. **Editors**, with the parser tag `<adslot name="NAME" />`. The name is reduced to lowercase
   letters, digits and hyphens.
2. **The server**, which adds the `feed` slot after the content of every page that gets ads.
3. **The module**, which adds automatic slots to articles that contain no manual slot that can be
   shown on the current platform (`$wgHamichlolAdsArticleAuto`).

A slot whose name has no unit on the current platform, or that is hidden (for example inside an
element that is not displayed on mobile, or inside a collapsed section on mobile), is removed. An empty slot takes no space, so a slot that
Taboola does not fill leaves no gap. Slots are not printed.

A filled slot clears floats, such as an infobox or images. So that an automatic slot does not leave
a gap beside floats at its place, the module fits it to them before Taboola fills it:

1. On desktop, the slot moves down to the first place below the floats: before a later element of
   the article that does not follow a heading, no further than the first end-matter heading, and at
   least 300px above the next slot.
2. Where there is no such place, and always on mobile (where the sections are collapsed), the slot
   is shown in the room beside the floats if that room is at least the unit's `minWidth`. If the
   unit has a `narrow` unit and the room is narrower than `narrow.below`, the slot uses the narrow
   unit instead, provided no other slot on the page uses it (by default, on desktop, `3x1` instead
   of `6x1` in a room narrower than 700px).
3. Otherwise the slot stays where it is and clears the floats.

Manual slots are not moved or fitted.

On desktop, the `feed` slot takes 70% of the content width and is centred; in the Minerva skin and
in windows narrower than 640px it takes the full width. Taboola's full-width feed is kept within the
page padding, because the Minerva skin clips content that extends beyond it.

Default slots:

| Slot | Desktop | Mobile | Placement |
|---|---|---|---|
| `home-mid` | `3x1` | — | Main page, desktop columns (the shorter one) |
| `home-stream` | — | `stream` | Main page, mobile column |
| `portal-mid` | `6x1` | `stream` | Portals |
| `article-mid` | `6x1` | `2x1` | Articles (automatic) |
| `feed` | `feed` | `feed` | After the content (automatic) |

Default automatic slots in articles, counted by top-level (`==`) sections:

| Platform | Position | Condition |
|---|---|---|
| Desktop | After the first section | At least 3 sections |
| Desktop | Before the end matter | At least 5 sections; the end-matter section is not one of the first two |
| Mobile | After the introduction | At least 2 sections |

Taboola requires each placement to be unique on a page. A unit whose `container` contains `$` is
numbered (`Mid Page Big Thumbnails 1`, `2`, …). Any other unit is used once per page; a second slot
with the same unit is removed and a warning is logged to the browser console.

**One slot, several places.** A slot whose unit is used once per page may be placed in several
columns, for example `home-mid` in each of the main page's two desktop columns. The slot is then
shown in only one of them: the shortest column at the time the page loads, which evens out the
columns (the content of the columns changes daily, and their heights depend on the window width).
The columns are the children of the places' nearest common ancestor. If they are not side by side
(for example, stacked in a narrow window), or two places are in the same column, the first place
is used. The other places are removed before Taboola is called. With an earlier version of this
extension, the first place is always used, so the extra places can be added to the wiki before or
after the upgrade.

## User rights and preferences

| Name | Type | Description |
|---|---|---|
| `hamichlolads-exempt` | Right | Users with this right see no ads. |
| `hamichlolads-show` | Preference | Shown only to users with `hamichlolads-exempt`, under *Appearance → Ads*. When checked, the user sees ads like any reader. Default: off. |

By default, `hamichlolads-exempt` is granted to every group with special rights on Hamichlol,
including bots. It is not granted to `user`, `autoconfirmed` or `emailconfirmed`. To grant it to a
group, or to revoke it, set in `LocalSettings.php`:

```php
$wgGroupPermissions['GROUP']['hamichlolads-exempt'] = true; // or false
```

Settings in `LocalSettings.php` take precedence over the defaults in `extension.json`.

## Ads policy link

Once Taboola has filled the `feed` slot, an info icon is shown on the feed's header row, opposite
Taboola's logo. It links to the page named by the message `hamichlolads-policypage`
(`Project:מדיניות הפרסומות` in Hebrew, `Project:Ads policy` in English, always resolved in the content
language). Its tooltip is the message `hamichlolads-policy`.

To link to another page, edit `MediaWiki:Hamichlolads-policypage` on the wiki. To remove the icon,
set that page to `-`.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `$wgHamichlolAdsEnabled` | `false` | Master switch. `false` removes all ads and the preference. |
| `$wgHamichlolAdsPublisherId` | `hamichlol-site` | Taboola publisher ID. |
| `$wgHamichlolAdsHideOnShabbat` | `false` | Hide all ads on Shabbat and holidays. |
| `$wgHamichlolAdsExcludeCategory` | `דפים ללא פרסומות` | Pages in this category get no ads. Empty string disables the check. |
| `$wgHamichlolAdsUnits` | 5 units | Taboola units: `mode`, `container`, `placement` and, optionally, `minWidth` (px; the narrowest room beside floats for an automatic slot; `6x1`: 500, `3x1`: 360, `2x1`: 200) and `narrow` (`unit`, `below` in px; the unit to use in a narrower room; `6x1`: `3x1` below 700). See [Slots](#slots). |
| `$wgHamichlolAdsSlots` | 5 slots | Slot name → unit per platform (`desktop`, `mobile`). |
| `$wgHamichlolAdsArticleAuto` | See above | Automatic slots per platform: `slot`, `position` (`after-intro`, `after-section-1`, `before-endmatter`) and `minSections`. |
| `$wgHamichlolAdsEndmatterHeadings` | `ראו גם`, `לקריאה נוספת`, `קישורים חיצוניים`, `ביאורים`, `הערות שוליים` | Section titles that start an article's end matter. |

The last four variables are delivered to the browser inside the module, so they are cached with it
rather than repeated in every page.

## Wiki setup

- **Template** `תבנית:משבצת פרסומת`, so that editors can place a slot with `{{משבצת פרסומת|NAME}}`:
  ```wikitext
  <includeonly>{{#tag:adslot||name={{{1|}}}}}</includeonly>
  ```
- **Category** `קטגוריה:דפים ללא פרסומות`, marked with `__HIDDENCAT__`.
- **Ads policy page** `המכלול:מדיניות הפרסומות`, linked from the feed.
- **Slots** on the main page (`{{משבצת פרסומת|home-mid}}` in each desktop column,
  `{{משבצת פרסומת|home-stream}}` in the mobile column) and on portals (`{{משבצת פרסומת|portal-mid}}`).

To keep a single page free of ads, add it to the exclude category. To remove all ads, set
`$wgHamichlolAdsEnabled = false;`.

## Files

| File | Contents |
|---|---|
| `extension.json` | Registration: hooks, right, preference, module and configuration defaults |
| `includes/HookHandler.php` | Server side: the page-view decision, the loader, the `feed` slot and policy link, the `<adslot>` tag and the preference |
| `resources/ext.hamichlolAds.js` | Browser side: automatic slots, fitting them to floats, and filling the slots |
| `resources/ext.hamichlolAds.less` | Slot spacing, slots beside floats, the feed width, the policy icon and print rules |
| `i18n/` | Interface messages |

## License

MIT. See [LICENSE](LICENSE).
