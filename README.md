# Branch Changes

[![VS Code Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/branch-changes.svg?style=flat&label=VS%20Code%20Marketplace&labelColor=007ACC)](https://marketplace.visualstudio.com/items?itemName=branch-changes)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Overview

Branch Changes is a simple VS Code extension that helps developers track and visualize code changes between Git branches. With a clean tree view directly integrated in the VS Code explorer, it provides a seamless way to understand what files have been modified.

## Features

- 🔍 **Real-time Change Tracking**: Automatically updates when files change, branches switch, or files are saved
- 🌳 **Hierarchical View**: Files are organized by folder structure for easier navigation
- 🔄 **Compare Any Two Branches**: Select which branch to compare against (defaults to main/master)
- 📊 **Color-coded Status**: Quickly identify staged, unstaged, and committed changes
- ⚡ **Auto-detection**: Automatically finds the most appropriate source branch
- 🖱️ **Click to Open**: Files open directly when clicked
- 🔄 **Automatic Refresh**: View stays current with file system changes

## Installation

Install this extension directly from the VS Code Marketplace:

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Branch Changes"
4. Click Install

Or install using the VS Code Quick Open (Ctrl+P):

```
ext install branch-changes
```

## Usage

The extension automatically adds a "Changed Files" view to your Explorer panel. From there, you can:

- **View Changed Files**: All modified files are shown in a tree view, organized by status and directory structure
- **Select Comparison Branch**: Click the branch selector at the top of the view to choose which branch to compare against
- **Open Files**: Click on any file to open it in the editor
- **Monitor Changes**: The view automatically refreshes when you make changes or switch branches

### Commands

- `Refresh Changed Files`: Manually refresh the changed files view
- `Select Comparison Branch`: Open a dropdown to select which branch to compare against

## Requirements

- Visual Studio Code v1.98.0 or higher
- Git installed and available in PATH

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

If you encounter any problems or have suggestions, please [open an issue](https://github.com/lterodde320/branch-changes/issues) on GitHub.