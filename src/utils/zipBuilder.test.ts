import test from 'node:test';
import assert from 'node:assert/strict';
import { buildZipArchive, crc32 } from './zipBuilder';

test('crc32 matches standard IEEE 802.3 vector', () => {
  const bytes = new TextEncoder().encode('123456789');
  assert.equal(crc32(bytes), 0xcbf43926);
});

test('buildZipArchive emits valid PKZIP headers and entry count', () => {
  const archive = buildZipArchive([
    { path: 'android-kiosk-launcher/settings.gradle.kts', content: 'rootProject.name = "KioskOSLauncher"\n' },
    { path: 'android-kiosk-launcher/app/src/main/AndroidManifest.xml', content: '<manifest/>' },
  ]);

  const view = new DataView(archive.buffer);
  // Local file header signature PK\x03\x04
  assert.equal(view.getUint32(0, true), 0x04034b50);
  // End of central directory signature PK\x05\x06 at archive.length - 22
  const eocdOffset = archive.length - 22;
  assert.equal(view.getUint32(eocdOffset, true), 0x06054b50);
  // Total entries = 2
  assert.equal(view.getUint16(eocdOffset + 10, true), 2);
});
