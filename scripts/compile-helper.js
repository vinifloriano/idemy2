const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (process.platform !== 'darwin') {
  console.log('Not on macOS, skipping native speech helper compilation.');
  process.exit(0);
}

try {
  console.log('Compiling macOS Apple Speech helper binary...');
  
  const nativeDir = path.resolve(__dirname, '../src/main/native');
  const swiftFile = path.join(nativeDir, 'apple-speech-helper.swift');
  const plistFile = path.join(nativeDir, 'Info.plist');
  const outFile = path.join(nativeDir, 'apple-speech-helper');
  
  // Find SDK path
  let sdkPath = '';
  try {
    sdkPath = execSync('xcrun --show-sdk-path --sdk macosx').toString().trim();
  } catch (e) {
    console.error('Failed to locate macOS SDK via xcrun. Ensure Xcode command line tools are installed.');
    process.exit(1);
  }
  
  // Compile command
  const compileCmd = `swiftc -sdk "${sdkPath}" "${swiftFile}" -o "${outFile}" -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker "${plistFile}"`;
  console.log(`Running: ${compileCmd}`);
  execSync(compileCmd, { stdio: 'inherit' });
  
  // Codesign command
  console.log('Codesigning helper binary to bind Info.plist...');
  const codesignCmd = `codesign -s - -f "${outFile}"`;
  console.log(`Running: ${codesignCmd}`);
  execSync(codesignCmd, { stdio: 'inherit' });
  
  console.log('Successfully compiled and signed apple-speech-helper!');
} catch (error) {
  console.error('Failed to compile apple-speech-helper:', error.message);
  process.exit(1);
}
