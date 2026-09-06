import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';

const directory = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(directory, '../../public/index.html'), 'utf8');
const studio = fs.readFileSync(path.join(directory, '../../public/js/studio.js'), 'utf8');

describe('provider settings UI', () => {
  it('renders the Azure OpenAI configuration controls', () => {
    const document = new JSDOM(page).window.document;
    const dialog = document.querySelector('#provider-settings-dialog');

    expect(dialog).not.toBeNull();
    expect(document.querySelector('#provider-select')?.value).toBe('azure-openai');
    expect(document.querySelector('#provider-endpoint')?.getAttribute('type')).toBe('url');
    expect(document.querySelector('#provider-api-key')?.getAttribute('type')).toBe('password');
    expect(document.querySelector('#provider-api-key')?.value).toBe('');
    expect(document.querySelector('#provider-deployment')).not.toBeNull();
    expect(document.querySelector('#provider-api-version')?.value).toBe('2025-04-01-preview');
    expect(document.querySelector('#provider-basic-tab')?.getAttribute('role')).toBe('tab');
    expect(document.querySelector('#provider-models-tab')?.getAttribute('role')).toBe('tab');
    expect(document.querySelector('#provider-models-panel')?.getAttribute('role')).toBe('tabpanel');
    expect(document.querySelector('#provider-model-id')).not.toBeNull();
    expect(document.querySelector('#provider-active-model')).not.toBeNull();
    expect(document.querySelectorAll('input[name="provider-mode"]')).toHaveLength(5);
    expect(studio).toContain("placeholder = settings?.hasApiKey ? '**********' : ''");
    expect(studio).toContain("elements['provider-api-key'].value = ''");
  });

  it('groups authenticated account actions in one account menu', () => {
    const document = new JSDOM(page).window.document;
    const accountMenu = document.querySelector('#account-menu');

    expect(accountMenu).not.toBeNull();
    expect(document.querySelector('#account-menu-toggle')).not.toBeNull();
    expect(accountMenu?.querySelector('#profile-toggle')?.textContent).toBe('Profile details');
    expect(accountMenu?.querySelector('#provider-settings-toggle')?.textContent).toBe('Provider settings');
    expect(accountMenu?.querySelector('#sign-out-button')?.textContent).toBe('Sign out');
    expect(document.querySelector('#workspace-usage')?.textContent).toBe('Session usage: 0 tokens');
    expect(document.querySelector('#details-panel #token-usage')).toBeNull();
  });

  it('uses the logo as the account menu trigger', () => {
    const document = new JSDOM(page).window.document;
    const trigger = document.querySelector('#account-menu-toggle');

    expect(document.querySelector('header .brand')).toBeNull();
    expect(trigger?.querySelector('.account-menu-logo')?.getAttribute('src')).toBe('/img/logo2.png');
    expect(trigger?.querySelector('.account-menu-icon')).not.toBeNull();
  });
});