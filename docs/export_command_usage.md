# PDF Export Command Usage

This document explains how to use the `npm run export` command to generate a PDF version of your resume, with options to customize the output.

## Command

To generate a PDF, use the following command:

```bash
npm run export -- [options]
```

The `--` is important to pass arguments correctly to the Node.js script.

## Options

You can use the following flags to customize the generated PDF:

- **`--lang=<language>`**
  - Specifies the language of the resume.
  - **Accepted values:** `en` (English), `sv` (Swedish).
  - **Default:** `en` (English)
  - **Example:** `--lang=sv`

- **`--tags=<tag1>,<tag2>,...`**
  - Filters the projects section to include only projects that have _all_ the specified tags.
  - Tags should be comma-separated without spaces.
  - **Default:** All projects are included.
  - **Example:** `--tags=React,TypeScript`

- **`--theme=<theme_name>`**
  - Applies a specific theme to the resume.
  - **Accepted values:** `default`, `warm`, `cold`, `dark` (based on `docs/data.json` themes).
  - **Default:** `default`
  - **Example:** `--theme=dark`

- **`--output=<filename.pdf>`**
  - Specifies the output filename and path for the PDF.
  - **Default:** If not provided, the PDF will be saved in the `exports/` directory with an automatically generated filename in the format `resume-<date>-<lang>-<tags>-<theme>.pdf`.
  - **Example:** `--output=my-custom-resume.pdf` (This will save the PDF in the root directory, not `exports/`, unless you specify `exports/my-custom-resume.pdf`).

## Examples

- **Export in English with all projects (default behavior):**

  ```bash
  npm run export
  ```

  This will generate a file like `exports/resume-YYYY-MM-DD-en-All.pdf`.

- **Export in Swedish with all projects:**

  ```bash
  npm run export -- --lang=sv
  ```

  This will generate a file like `exports/resume-YYYY-MM-DD-sv-All.pdf`.

- **Export in English, filtering projects by 'React' and 'Next.js' tags:**

  ```bash
  npm run export -- --tags=React,Next.js
  ```

  This will generate a file like `exports/resume-YYYY-MM-DD-en-React_Next.js.pdf`.

- **Export in English with 'dark' theme:**

  ```bash
  npm run export -- --theme=dark
  ```

  This will generate a file like `exports/resume-YYYY-MM-DD-en-All-dark.pdf`.

- **Export in Swedish, with 'React' and 'TypeScript' tags, using 'warm' theme, and a custom output filename:**
  ```bash
  npm run export -- --lang=sv --tags=React,TypeScript --theme=warm --output=exports/samuel-ward-cv-swedish.pdf
  ```

## Output Location

By default, all generated PDFs are saved in the `exports/` directory at the root of the project. If the `exports/` directory does not exist, it will be created automatically. You can change this behavior using the `--output` flag.

## Cover Letter Generation

You can generate a cover letter based on your resume data. By default, running the cover letter command skips AI generation and opens your browser immediately with sample text ready for editing. When you click **Save** in the browser, the PDF is generated and saved to `exports/`. You can also optionally generate cover letters with AI (Gemini).

### Commands

#### 1. Default (Manual Editing with Sample Text)

Skips AI generation, loads sample text tailored to the selected language (`en` or `sv`), and opens the browser for editing:

```bash
npm run export:cover-letter
```

With options:

```bash
npm run export:cover-letter -- [options]
```

#### 2. AI Generation (Optional)

Generate a personalized cover letter using Google Gemini based on your resume data and a job description:

```bash
npm run export:cover-letter:ai -- --prompt="<Job Description/Instructions>" [options]
```

**or:**

```bash
npm run export:cover-letter -- --ai --prompt="<Job Description/Instructions>" [options]
```

**or scrape from URL:**

```bash
npm run export:cover-letter:ai -- --url="https://www.job-description.com/" [options]
```

> **Note:** For AI generation, you must have a `.env` file in the project root with your Gemini API key:
> ```
> GEMINI_API_KEY=your_api_key_here
> ```

### Options

- **`--lang=<language>`**
  - Specifies the language of the cover letter.
  - **Accepted values:** `en` (English), `sv` (Swedish).
  - **Default:** `en`
  - **Example:** `--lang=sv`

- **`--company=<name>`**
  - Specifies the company name. Used in the sample text and in the exported PDF filename.
  - **Example:** `--company="Spotify"`

- **`--theme=<theme_name>`**
  - Applies a specific theme (colors/fonts) to match your resume.
  - **Accepted values:** `default`, `warm`, `cold`, `dark`.
  - **Default:** `default`
  - **Example:** `--theme=dark`

- **`--output=<filename.pdf>`**
  - Specifies the output filename.
  - **Default:** `exports/cover-letter-<date>-<lang>[-<company_name>].pdf`
  - **Example:** `--output=exports/my-cover-letter.pdf`

- **`--prompt=<text>`** (AI mode)
  - The job description or instructions for the cover letter. Triggers AI mode.
  - **Example:** `--prompt="Software Engineer at Google, focusing on cloud infrastructure."`

- **`--url=<url>`** (AI mode)
  - URL to scrape job description from. Triggers AI mode.

- **`--no-browser`**
  - Generates the PDF directly without opening the browser.

- **`--non-dev`** (or **`--nondev`**)
  - Non-dev mode: uses `docs/data-nondev.json` profile and removes the GitHub link from the header.
  - **Example:** `npm run export:cover-letter -- --non-dev`

### Examples

- **Open English cover letter with sample text in browser (default):**

  ```bash
  npm run export:cover-letter
  ```

- **Open Swedish cover letter with company name and 'warm' theme:**

  ```bash
  npm run export:cover-letter -- --lang=sv --company="Volvo" --theme=warm
  ```

- **Generate an AI cover letter in Swedish with 'dark' theme:**

  ```bash
  npm run export:cover-letter:ai -- --lang=sv --theme=dark --prompt="Fullstack-utvecklare på Ericsson. Betona erfarenhet av .NET och Azure."
  ```
