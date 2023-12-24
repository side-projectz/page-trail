# Chrome Time Tracker Extension

## Overview
This project is a Chrome extension developed using Next.js 14, designed to track the time spent on different websites. It records the active time on each website, aggregates it at the domain level, and provides a summary view of web activity. The extension is capable of filtering out certain URLs, resetting data daily, and sending usage statistics to a server.

## Features
- **Time Tracking:** Records time spent on each website, aggregated by domain.
- **URL Filtering:** Excludes specific URLs and domains from tracking (e.g., internal Chrome pages).
- **Daily Reset:** Automatically resets tracking data at midnight each day.
- **Data Transmission:** Sends collected data to a specified server for analysis or record-keeping.
- **Last Visit Tracking:** Captures the last visit or quit time for each page.

## Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/chrome-time-tracker.git
   ```
2. Navigate to the project directory:
   ```bash
   cd chrome-time-tracker
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Build the project:
   ```bash
   npm run build
   ```
5. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`.
   - Enable 'Developer mode'.
   - Click 'Load unpacked' and select the `build` folder of your project.

## Usage
- The extension starts tracking time automatically when a website is visited.
- To view the tracked data, click on the extension icon.
- Use the provided interface to see aggregated time by domain and other statistics.

## Configuration
- **Exclusion Rules:** Modify `exclusionRules` in `background.js` to add or remove URL patterns and domains from tracking.
- **Server Endpoint:** Set the server endpoint in `fetch` call within `background.js` to send data to your server.

## Contributing
Contributions to improve the extension are welcome. Please follow these steps:
1. Fork the repository.
2. Create a new branch: `git checkout -b your-branch-name`.
3. Make your changes and commit them: `git commit -am 'Add some feature'`.
4. Push to the branch: `git push origin your-branch-name`.
5. Create a new Pull Request.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments
- Next.js Team for the amazing framework.
- Chrome Developers for the extensive documentation on Chrome Extensions.
- A special thanks to [IbnzUK](https://github.com/ibnzUK) and their project [next-chrome-starter](https://github.com/ibnzUK/next-chrome-starter), which served as a template and inspiration for this extension.

---

Made with ❤️ and JavaScript.