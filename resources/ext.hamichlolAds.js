/**
 * Fills the ad slots on the page with Taboola units.
 *
 * Loaded only on page views that get ads (the server decides). A slot is
 * <div class="hm-ad-slot" data-slot="NAME">: placed by editors (<adslot>), the feed slot
 * that the server adds after the content, or an automatic slot that this module adds to
 * articles without a manual slot that can be shown (config.articleAuto), fitted to the floats
 * beside its place (fitToFloats).
 * Each slot name maps to a unit per platform (config.slots). A slot without a unit for
 * the current platform, or a hidden one (for example inside .nomobile), is removed.
 */
const config = require( './config.json' );
const platform = mw.config.get( 'skin' ) === 'minerva' ? 'mobile' : 'desktop';

/** A gap this small (about the margin of a filled slot) is not worth moving a slot for, in px. */
const GAP_TOLERANCE = 20;

/** A slot that moves below floats stays at least this far above the next slot, in px. */
const MIN_SLOT_DISTANCE = 300;

/**
 * Adds this platform's automatic slots to an article, relative to its top-level section headings.
 *
 * @param {HTMLElement} content
 */
function addArticleSlots( content ) {
	// On mobile too, each heading is a direct child of the content (right before its <section>).
	const headings = Array.from( content.querySelectorAll( ':scope > .mw-heading2' ) );
	const slots = [];
	for ( const rule of config.articleAuto[ platform ] || [] ) {
		if ( headings.length < rule.minSections ) {
			continue;
		}
		let before;
		if ( rule.position === 'after-intro' ) {
			before = headings[ 0 ];
		} else if ( rule.position === 'after-section-1' ) {
			before = headings[ 1 ];
		} else if ( rule.position === 'before-endmatter' ) {
			// The first end-matter section, but not one of the first two (that would sit next to after-section-1).
			before = headings.find( ( heading, i ) => i > 1 && isEndmatterHeading( heading ) );
		}
		if ( before ) {
			const slot = document.createElement( 'div' );
			slot.className = 'hm-ad-slot';
			slot.dataset.slot = rule.slot;
			content.insertBefore( slot, before );
			slots.push( slot );
		}
	}
	slots.forEach( fitToFloats );
}

/**
 * Whether the element is the heading of an end-matter section (config.endmatter).
 *
 * @param {HTMLElement} el
 * @return {boolean}
 */
function isEndmatterHeading( el ) {
	return el.classList.contains( 'mw-heading2' ) &&
		config.endmatter.includes( ( el.querySelector( 'h2' ) || el ).textContent.trim() );
}

/**
 * How far down an empty slot would move if it cleared the floats beside it, in px.
 *
 * @param {HTMLElement} slot
 * @return {number}
 */
function clearance( slot ) {
	const top = slot.getBoundingClientRect().top;
	slot.style.clear = 'both';
	const gap = slot.getBoundingClientRect().top - top;
	slot.style.clear = '';
	return gap;
}

/**
 * Whether a slot can be placed right before this element: the element is displayed, and the
 * displayed element before it is not a heading (a slot does not separate a heading from its text).
 *
 * @param {HTMLElement} el
 * @return {boolean}
 */
function isPlaceBefore( el ) {
	if ( !el.getClientRects().length ) {
		return false;
	}
	let prev = el.previousElementSibling;
	while ( prev && ( !prev.getClientRects().length || prev.classList.contains( 'hm-ad-slot' ) ) ) {
		prev = prev.previousElementSibling;
	}
	return !prev || !prev.matches( '.mw-heading, h1, h2, h3, h4, h5, h6' );
}

/**
 * Fits an automatic slot to floats beside its place (an infobox or images), so that it leaves
 * no gap when it clears them. On desktop it moves down to the first place below them, if there is
 * one in the article body (moveBelowFloats). Otherwise, if the room beside them is as wide as the
 * unit's minWidth, the slot takes that room, with the unit's narrow unit if the room is narrower
 * than narrow.below and that unit is not used elsewhere on the page. Otherwise it stays, and
 * clears them once filled. On mobile the sections are collapsed, so a slot does not move.
 *
 * @param {HTMLElement} slot An empty slot, a child of the content
 */
function fitToFloats( slot ) {
	const gap = clearance( slot );
	if ( gap < GAP_TOLERANCE || ( platform === 'desktop' && moveBelowFloats( slot, gap ) ) ) {
		return;
	}
	slot.classList.add( 'hm-ad-slot-beside' );
	const width = slot.getBoundingClientRect().width;
	let unitName = unitNameOf( slot );
	const narrow = ( config.units[ unitName ] || {} ).narrow;
	if ( narrow && width < narrow.below && !Array.from( document.querySelectorAll( '.hm-ad-slot' ) )
		.some( ( other ) => other !== slot && unitNameOf( other ) === narrow.unit )
	) {
		unitName = narrow.unit;
	}
	const minWidth = ( config.units[ unitName ] || {} ).minWidth;
	if ( !minWidth || width < minWidth ) {
		slot.classList.remove( 'hm-ad-slot-beside' );
	} else if ( unitName !== unitNameOf( slot ) ) {
		slot.dataset.unit = unitName;
	}
}

/**
 * Moves a slot down to the first place below the floats beside it: before one of the elements
 * that follow, up to the end matter (the slot may go right before an end-matter heading, but not
 * past it), and at least MIN_SLOT_DISTANCE above the next slot.
 *
 * @param {HTMLElement} slot
 * @param {number} gap The slot's clearance where it is
 * @return {boolean} Whether there was such a place (otherwise the slot stays where it was)
 */
function moveBelowFloats( slot, gap ) {
	const home = slot.nextElementSibling;
	let places = [];
	let el = home.nextElementSibling;
	for ( ; el && !el.classList.contains( 'hm-ad-slot' ); el = el.nextElementSibling ) {
		places.push( el );
		if ( isEndmatterHeading( el ) ) {
			break;
		}
	}
	if ( el && el.classList.contains( 'hm-ad-slot' ) ) {
		const lowest = el.getBoundingClientRect().top - MIN_SLOT_DISTANCE;
		places = places.filter( ( place ) => place.getBoundingClientRect().top <= lowest );
	}
	let i = 0;
	while ( gap >= GAP_TOLERANCE ) {
		// Where the floats end. A place found below it is checked again, for floats that start after it.
		const floatsEnd = slot.getBoundingClientRect().top + gap - GAP_TOLERANCE;
		while ( i < places.length &&
			!( places[ i ].getBoundingClientRect().top >= floatsEnd && isPlaceBefore( places[ i ] ) )
		) {
			i++;
		}
		if ( i === places.length ) {
			home.before( slot );
			return false;
		}
		places[ i++ ].before( slot );
		gap = clearance( slot );
	}
	return true;
}

/**
 * The name of the slot's unit on this platform (or the unit that fitToFloats chose), or undefined.
 *
 * @param {HTMLElement} slot
 * @return {string|undefined}
 */
function unitNameOf( slot ) {
	return slot.dataset.unit || ( config.slots[ slot.dataset.slot ] || {} )[ platform ];
}

/**
 * Whether a slot can be shown: it has a unit on this platform and it is displayed
 * (not, for example, inside .nomobile or a collapsed section on mobile).
 *
 * @param {HTMLElement} slot
 * @return {boolean}
 */
function isUsable( slot ) {
	return config.units[ unitNameOf( slot ) ] !== undefined && slot.getClientRects().length > 0;
}

/**
 * Hands every usable slot to Taboola, and removes the rest.
 */
function fillSlots() {
	const usedUnits = {};
	let filled = false;
	for ( const slot of document.querySelectorAll( '.hm-ad-slot' ) ) {
		if ( !isUsable( slot ) ) {
			slot.remove();
			continue;
		}
		const unitName = unitNameOf( slot );
		const unit = config.units[ unitName ];
		// Taboola needs a unique placement on the page: a unit with '$' is numbered, any other is used once.
		const n = ( usedUnits[ unitName ] || 0 ) + 1;
		if ( n > 1 && !unit.container.includes( '$' ) ) {
			mw.log.warn( 'HamichlolAds: unit "' + unitName + '" appears twice on this page; the second slot was removed.' );
			slot.remove();
			continue;
		}
		usedUnits[ unitName ] = n;
		slot.id = unit.container.replace( '$', n );
		window._taboola.push( {
			mode: unit.mode,
			container: slot.id,
			placement: unit.placement.replace( '$', n ),
			// eslint-disable-next-line camelcase
			target_type: 'mix'
		} );
		filled = true;
	}
	if ( filled ) {
		window._taboola.push( { flush: true } );
	}
}

const content = document.querySelector( '#mw-content-text .mw-parser-output' );
// A manual slot turns the automatic ones off, but only if it can be shown on this platform.
if ( content && mw.config.get( 'wgHamichlolAdsPageType' ) === 'article' &&
	!Array.from( content.querySelectorAll( '.hm-ad-slot' ) ).some( isUsable )
) {
	addArticleSlots( content );
}
fillSlots();
