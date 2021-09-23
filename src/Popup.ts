import type CriiptoAuth from './index';
import type {PopupAuthorizeParams, AuthorizeResponse, GenericObject} from './types';
import {parseAuthorizeResponseFromLocation, CRIIPTO_AUTHORIZE_RESPONSE, CRIIPTO_POPUP_ID, CRIIPTO_POPUP_BACKDROP_ID, CRIIPTO_POPUP_BACKDROP_BUTTON_OPEN_ID, CRIIPTO_POPUP_BACKDROP_BUTTON_CLOSE_ID} from './util';

export default class CriiptoAuthPopup {
  criiptoAuth: CriiptoAuth;
  _latestParams: PopupAuthorizeParams;
  backdrop: CriiptoAuthPopupBackdrop;
  window: Window;

  constructor(criiptoAuth: CriiptoAuth) {
    this.criiptoAuth = criiptoAuth;
    this.backdrop = new CriiptoAuthPopupBackdrop(this);
  }

  open(params: PopupAuthorizeParams): Promise<Window> {
    const {width, height, ...authorizeUrlParams} = params;
    const redirectUri = authorizeUrlParams.redirectUri || this.criiptoAuth.options.redirectUri;

    return this.criiptoAuth.generatePKCE(redirectUri!).then(pkce => {
      const params = this.criiptoAuth.buildAuthorizeParams({
        ...authorizeUrlParams,
        responseMode: 'query',
        responseType: 'code',
        pkce
      });
      return this.criiptoAuth.buildAuthorizeUrl(params);
    }).then(url => {
      const features = `width=${width || 330},height=${height || 600}`;
      return window.open(url, CRIIPTO_POPUP_ID, features);
    }).then(window => {
      this.window = window!;
      return window!;
    });
  }

  authorize(params: PopupAuthorizeParams): Promise<AuthorizeResponse> {
    this._latestParams = params;
    this.backdrop.render();

    return this.open(params).then(() => {
      return new Promise<AuthorizeResponse>((resolve, reject) => {
        const receiveMessage = (event: MessageEvent) => {
          if (event.source !== this.window) return;

          const eventType:string | null = event.data.startsWith(CRIIPTO_AUTHORIZE_RESPONSE) ? CRIIPTO_AUTHORIZE_RESPONSE : null;
          const eventData:GenericObject = eventType === CRIIPTO_AUTHORIZE_RESPONSE ? JSON.parse(event.data.replace(CRIIPTO_AUTHORIZE_RESPONSE, '')) : null;
          
          if (eventData && eventData.error) {
            this.criiptoAuth.processResponse(eventData).then(resolve, reject);
            window.removeEventListener('message', receiveMessage);
          } else if (eventData && (eventData.code || eventData.id_token)) {
            this.criiptoAuth.processResponse(eventData).then(resolve, reject);
            window.removeEventListener('message', receiveMessage);
          }
        };
    
        window.addEventListener('message', receiveMessage);
      });
    }).finally(() => {
      this.backdrop.remove();
    });
  }

  close() {
    this.window.close();
  }

  callback(origin: string | "*") {
    if (!origin) throw new Error('popup.callback required argument origin');
    const params = parseAuthorizeResponseFromLocation(window.location);
    window.opener.postMessage(CRIIPTO_AUTHORIZE_RESPONSE + JSON.stringify(params), origin);
    window.close();
  }
}

export class CriiptoAuthPopupBackdrop {
  popup: CriiptoAuthPopup;
  enabled: boolean;
  template: string;
  
  constructor(popup: CriiptoAuthPopup) {
    this.popup = popup;
    this.enabled = true;
    this.template = `
<div class="criipto-auth-popup-backdrop-background"></div>
<div class="criipto-auth-popup-backdrop-content">
  <p>Don't see the login popup?</p>
  <button id="${CRIIPTO_POPUP_BACKDROP_BUTTON_OPEN_ID}">Reopen popup</button>
  <button id="${CRIIPTO_POPUP_BACKDROP_BUTTON_CLOSE_ID}">Cancel</button>
</div>
`;

    this.handleOpen = this.handleOpen.bind(this);
    this.handleCancel = this.handleCancel.bind(this);
  }

  render() {
    const exists = document.getElementById(CRIIPTO_POPUP_BACKDROP_ID);
    
    if (!exists) {
      const element = document.createElement('div');
      element.id = CRIIPTO_POPUP_BACKDROP_ID;
      element.className = 'criipto-auth-popup-backdrop';
      element.innerHTML = this.template;

      document.body.appendChild(element);
      document.getElementById(CRIIPTO_POPUP_BACKDROP_BUTTON_OPEN_ID)?.addEventListener('click', this.handleOpen);
      document.getElementById(CRIIPTO_POPUP_BACKDROP_BUTTON_CLOSE_ID)?.addEventListener('click', this.handleCancel);
    }
  }

  handleOpen() {
    this.popup.open(this.popup._latestParams);
  }

  handleCancel() {
    this.popup.close();
    this.remove();
  }

  remove() {
    document.body.removeChild(document.getElementById(CRIIPTO_POPUP_BACKDROP_ID)!);
  }
}
