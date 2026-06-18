import { Component } from 'react';
import { i18n } from '../i18n/index';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('[HMS UI]', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="content px-4 py-8">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
            <p className="font-semibold">{i18n.t('errorBoundary.title', { ns: 'common' })}</p>
            <p className="mt-1 text-red-700">{this.state.error.message || i18n.t('errorBoundary.unknown', { ns: 'common' })}</p>
            <p className="mt-2 text-xs text-red-600">
              {i18n.t('errorBoundary.hint_prefix', { ns: 'common' })}{' '}
              <code className="rounded bg-red-100 px-1">npm run build:ui</code>{' '}
              {i18n.t('errorBoundary.hint_suffix', { ns: 'common' })}
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
