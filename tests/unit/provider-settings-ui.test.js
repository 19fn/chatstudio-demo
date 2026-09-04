import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';

const directory = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(directory, '../../public/index.html'), 'utf8');

describe('provider settings UI', () => {
  it('renders the Azure OpenAI configuration controls', () => {
    const document = new JSDOM(page).window.document;
    const dialog = document.querySelector('#provider-settings-dialog');

    expect(dialog).not.toBeNull();
    expect(document.querySelector('#provider-select')?.value).toBe('azure-openai');
    expect(document.querySelector('#provider-endpoint')?.getAttribute('type')).toBe('url');
    expect(document.querySelector('#provider-api-key')?.getAttribute('type')).toBe('password');
    expect(document.querySelector('#provider-deployment')).not.toBeNull();
    expect(document.querySelector('#provider-model')?.value).toBe('gpt-5.4-mini');
  });

  it('groups authenticated account actions in one account menu', () => {
    const document = new JSDOM(page).window.document;
    const accountMenu = document.querySelector('#account-menu');

    expect(accountMenu).not.toBeNull();
    expect(document.querySelector('#account-menu-toggle')).not.toBeNull();
    expect(accountMenu?.querySelector('#profile-toggle')?.textContent).toBe('Profile details');
    expect(accountMenu?.querySelector('#provider-settings-toggle')?.textContent).toBe('Provider settings');
    expect(accountMenu?.querySelector('#sign-out-button')?.textContent).toBe('Sign out');
  });
});