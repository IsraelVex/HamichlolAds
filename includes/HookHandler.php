<?php

namespace MediaWiki\Extension\HamichlolAds;

use MediaWiki\Config\Config;
use MediaWiki\Hook\BeforePageDisplayHook;
use MediaWiki\Hook\ParserFirstCallInitHook;
use MediaWiki\Hook\SkinAfterContentHook;
use MediaWiki\Html\Html;
use MediaWiki\MediaWikiServices;
use MediaWiki\Output\OutputPage;
use MediaWiki\Preferences\Hook\GetPreferencesHook;
use MediaWiki\Skin\Skin;
use MediaWiki\Title\Title;
use MediaWiki\User\Options\UserOptionsLookup;

/**
 * Taboola ads in slots that the site places and controls.
 *
 * For every page view the server decides whether it gets ads (getPageType). If it does,
 * it adds Taboola's loader to the head, a feed slot after the content (with a link to the
 * ads policy), and the ext.hamichlolAds module, which fills the slots in the browser.
 */
class HookHandler implements
	ParserFirstCallInitHook,
	BeforePageDisplayHook,
	SkinAfterContentHook,
	GetPreferencesHook
{
	/** Hamichlol's Portal namespace ("פורטל"). */
	private const PORTAL_NAMESPACE = 4000;

	/** Carries the page type from BeforePageDisplay to SkinAfterContent (set only when the page gets ads). */
	private const PAGE_TYPE_PROPERTY = 'hamichlolAdsPageType';

	private Config $config;
	private UserOptionsLookup $userOptionsLookup;

	public function __construct(
		 Config $config,
		 UserOptionsLookup $userOptionsLookup
	) {
		$this->config = $config;
		$this->userOptionsLookup = $userOptionsLookup;
	}

	/**
	 * <adslot name="NAME" /> becomes an empty slot that the front-end fills.
	 * The name is reduced to a-z, 0-9 and "-"; a name with no unit stays empty.
	 *
	 * @inheritDoc
	 */
	public function onParserFirstCallInit( $parser ) {
		$parser->setHook( 'adslot', static function ( $input, array $args ): string {
			$name = preg_replace( '/[^a-z0-9-]/', '', strtolower( $args['name'] ?? '' ) );
			return $name === '' ? '' : Html::element( 'div', [ 'class' => 'hm-ad-slot', 'data-slot' => $name ] );
		} );
	}

	/** @inheritDoc */
	public function onBeforePageDisplay( $out, $skin ): void {
		$pageType = $this->getPageType( $out );
		if ( $pageType === null ) {
			return;
		}
		$out->setProperty( self::PAGE_TYPE_PROPERTY, $pageType );
		$out->addHeadItem( 'hamichlol-ads-loader', Html::inlineScript( $this->loaderScript( $pageType ) ) );
		$out->addJsConfigVars( 'wgHamichlolAdsPageType', $pageType );
		$out->addModules( 'ext.hamichlolAds' );
	}

	/**
	 * The feed slot, after the content.
	 *
	 * @inheritDoc
	 */
	public function onSkinAfterContent( &$data, $skin ): void {
		if ( $skin->getOutput()->getProperty( self::PAGE_TYPE_PROPERTY ) !== null ) {
			$data .= Html::rawElement( 'div', [ 'class' => 'hm-ad-feed' ],
				Html::element( 'div', [ 'class' => 'hm-ad-slot', 'data-slot' => 'feed' ] ) .
				$this->getPolicyLink( $skin )
			);
		}
	}

	/**
	 * An info icon that links to the ads policy page, named by the message "hamichlolads-policypage".
	 * The stylesheet shows it on Taboola's header row once the feed is filled.
	 * Empty when the message is disabled ("-") or is not a valid title.
	 */
	private function getPolicyLink( Skin $skin ): string {
		$page = $skin->msg( 'hamichlolads-policypage' )->inContentLanguage();
		$title = $page->isDisabled() ? null : Title::newFromText( $page->text() );
		if ( !$title ) {
			return '';
		}
		$label = $skin->msg( 'hamichlolads-policy' )->text();
		return Html::element( 'a', [
			'class' => 'hm-ad-info',
			'href' => $title->getLocalURL(),
			'title' => $label,
			'aria-label' => $label,
		] );
	}

	/**
	 * "Show me ads on the site", under Appearance, for users who are exempt from ads.
	 *
	 * @inheritDoc
	 */
	public function onGetPreferences( $user, &$preferences ) {
		if ( $this->config->get( 'HamichlolAdsEnabled' ) && $user->isAllowed( 'hamichlolads-exempt' ) ) {
			$preferences['hamichlolads-show'] = [
				'type' => 'toggle',
				'label-message' => 'hamichlolads-pref-show',
				'help-message' => 'hamichlolads-pref-show-help',
				'section' => 'rendering/hamichlolads',
			];
		}
	}

	/**
	 * Taboola's page type (home / category / article), or null when this page view gets no ads.
	 */
	private function getPageType( OutputPage $out ): ?string {
		$title = $out->getTitle();
		if ( !$this->config->get( 'HamichlolAdsEnabled' ) || !$title ) {
			return null;
		}

		if ( $title->isMainPage() ) {
			$pageType = 'home';
		} elseif ( $title->inNamespace( self::PORTAL_NAMESPACE ) ) {
			$pageType = 'category';
		} elseif ( $title->inNamespace( NS_MAIN ) ) {
			$pageType = 'article';
		} else {
			return null;
		}

		// Only a plain view of the current version: no edit, history, old revision, diff or printable version.
		$request = $out->getRequest();
		if ( $out->getActionName() !== 'view' || $request->getCheck( 'oldid' ) || $request->getCheck( 'diff' )
			|| $out->isPrintable() || !$title->exists() || $title->isRedirect()
		) {
			return null;
		}

		$noAdsCategory = $this->config->get( 'HamichlolAdsExcludeCategory' );
		if ( $noAdsCategory !== '' && is_array( $noAdsCategory )&& in_array( $noAdsCategory, $out->getCategories(), true ) ) {
			return null;
		}

		if ( $this->config->get( 'HamichlolAdsHideOnShabbat' ) ) {
			// during shabbat the site is in read only mode so no ads are displayed.
			$readOnlyMode = MediaWikiServices::getInstance()->getReadOnlyMode();
			$reason =$readOnlyMode->getReason();
			if ( $readOnlyMode->isReadOnly() && $reason === 'המכלול נעול לעריכה בשבת ומועדי ישראל' ) {
				return null;
			}
		}

		// Users with special rights see no ads, unless they turned them on in their preferences.
		$user = $out->getUser();
		if ( $user->isAllowed( 'hamichlolads-exempt' )
			&& !$this->userOptionsLookup->getBoolOption( $user, 'hamichlolads-show' )
		) {
			return null;
		}

		return $pageType;
	}

	/**
	 * Taboola's loader for the configured publisher and the page type.
	 *
	 * The loader comes from Taboola's CDN only, with no fallback to other domains,
	 * so ad blockers are respected.
	 */
	private function loaderScript( string $pageType ): string {
		$src = Html::encodeJsVar(
			'//cdn.taboola.com/libtrc/' . rawurlencode( $this->config->get( 'HamichlolAdsPublisherId' ) ) . '/loader.js'
		);
		$pageTypePush = Html::encodeJsVar( [ $pageType => 'auto' ] );
		return <<<JS
window._taboola = window._taboola || [];
_taboola.push($pageTypePush);
(function (s) {
	s.async = true;
	s.src = $src;
	s.id = 'tb_loader_script';
	document.head.appendChild(s);
}(document.createElement('script')));
if (window.performance && typeof window.performance.mark === 'function') {
	window.performance.mark('tbl_ic');
}
JS;
	}
}
