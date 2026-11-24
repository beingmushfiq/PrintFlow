import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export interface UsePageTitleOptions {
  subtitle?: string;
  exactTitle?: string;
  prefixShopName?: string;
}

/**
 * Dynamically updates document.title reactively based on current view and language.
 */
export function usePageTitle(options: UsePageTitleOptions = {}) {
  const { t, i18n } = useTranslation(['common']);

  useEffect(() => {
    const appName = t('common:app_name', { defaultValue: 'PrintFlow' });
    const tagline = t('common:tagline', { defaultValue: 'Autonomous Walk-in Print Shop Automation' });

    let finalTitle = `${appName} - ${tagline}`;

    if (options.exactTitle) {
      finalTitle = options.exactTitle;
    } else if (options.prefixShopName) {
      finalTitle = `${options.prefixShopName} | ${appName}`;
    } else if (options.subtitle) {
      finalTitle = `${options.subtitle} | ${appName}`;
    }

    document.title = finalTitle;
  }, [options.subtitle, options.exactTitle, options.prefixShopName, i18n.language, t]);
}
