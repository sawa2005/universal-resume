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

*   **`--lang=<language>`**
    *   Specifies the language of the resume.
    *   **Accepted values:** `en` (English), `sv` (Swedish).
    *   **Default:** `en` (English)
    *   **Example:** `--lang=sv`

*   **`--tags=<tag1>,<tag2>,...`**
    *   Filters the projects section to include only projects that have *all* the specified tags.
    *   Tags should be comma-separated without spaces.
    *   **Default:** All projects are included.
    *   **Example:** `--tags=React,TypeScript`

*   **`--theme=<theme_name>`**
    *   Applies a specific theme to the resume.
    *   **Accepted values:** `default`, `warm`, `cold`, `dark` (based on `docs/data.json` themes).
    *   **Default:** `default`
    *   **Example:** `--theme=dark`

*   **`--output=<filename.pdf>`**
    *   Specifies the output filename and path for the PDF.
    *   **Default:** If not provided, the PDF will be saved in the `exports/` directory with an automatically generated filename in the format `resume-<date>-<lang>-<tags>-<theme>.pdf`.
    *   **Example:** `--output=my-custom-resume.pdf` (This will save the PDF in the root directory, not `exports/`, unless you specify `exports/my-custom-resume.pdf`).

## Examples

*   **Export in English with all projects (default behavior):**
    ```bash
    npm run export
    ```
    This will generate a file like `exports/resume-YYYY-MM-DD-en-All.pdf`.

*   **Export in Swedish with all projects:**
    ```bash
    npm run export -- --lang=sv
    ```
    This will generate a file like `exports/resume-YYYY-MM-DD-sv-All.pdf`.

*   **Export in English, filtering projects by 'React' and 'Next.js' tags:**
    ```bash
    npm run export -- --tags=React,Next.js
    ```
    This will generate a file like `exports/resume-YYYY-MM-DD-en-React_Next.js.pdf`.

*   **Export in English with 'dark' theme:**
    ```bash
    npm run export -- --theme=dark
    ```
    This will generate a file like `exports/resume-YYYY-MM-DD-en-All-dark.pdf`.

*   **Export in Swedish, with 'React' and 'TypeScript' tags, using 'warm' theme, and a custom output filename:**
    ```bash
    npm run export -- --lang=sv --tags=React,TypeScript --theme=warm --output=exports/samuel-ward-cv-swedish.pdf
    ```

## Output Location

By default, all generated PDFs are saved in the `exports/` directory at the root of the project. If the `exports/` directory does not exist, it will be created automatically. You can change this behavior using the `--output` flag.

## Cover Letter Generation

You can also generate a personalized cover letter using AI (Gemini) based on your resume data.

### Command

```bash
npm run export:cover-letter -- --prompt="<Job Description/Instructions>" [options]
```

**Note:** You must create a `.env` file in the project root with your Gemini API key:
```
GEMINI_API_KEY=your_api_key_here
```

### Options

*   **`--prompt=<text>`** (Required)
    *   The job description or specific instructions for the cover letter. Enclose in quotes.
    *   **Example:** `--prompt="Software Engineer at Google, focusing on cloud infrastructure."`

*   **`--lang=<language>`**
    *   Specifies the language of the cover letter.
    *   **Accepted values:** `en` (English), `sv` (Swedish).
    *   **Default:** `en`
    *   **Example:** `--lang=sv`

*   **`--theme=<theme_name>`**
    *   Applies a specific theme (colors/fonts) to match your resume.
    *   **Accepted values:** `default`, `warm`, `cold`, `dark`.
    *   **Default:** `default`
    *   **Example:** `--theme=dark`

*   **`--output=<filename.pdf>`**
    *   Specifies the output filename.
    *   **Default:** `exports/cover-letter-<date>-<lang>.pdf`

### Examples

*   **Generate a standard English cover letter:**
    ```bash
    npm run export:cover-letter -- --prompt="Front-end developer role at startup X. Focus on React experience."
    ```

*   **Generate a Swedish cover letter with the 'dark' theme:**
    ```bash
    npm run export:cover-letter -- --lang=sv --theme=dark --prompt="Fullstack-utvecklare på Ericsson. Betona erfarenhet av .NET och Azure."
    ```
