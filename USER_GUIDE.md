# Text-to-SQL Agent User Guide

This guide explains how to use the application to upload data, ask questions, review generated SQL, and export results.

## 1. Sign in

Open the frontend and choose **Continue with Google**. Google sign-in is required before querying data or managing datasets. Complete the reCAPTCHA challenge when it appears.

If sign-in fails, check that the Google client ID is configured for both the frontend and backend and that the current frontend URL is registered in Google Cloud.

## 2. Upload datasets

Open the **Dataset** panel and choose **Upload datasets**. You can select one or several files at once.

Supported formats:

- CSV and TSV
- Excel: XLSX and XLS
- JSON, JSONL, and NDJSON
- Parquet
- XML
- YAML and YML

The upload progress shows the file transfer percentage. After upload, the application automatically reads the files, profiles their contents, creates database tables, discovers likely relationships, and rebuilds the schema index.

Excel workbooks are read sheet by sheet. Each sheet becomes a separate queryable table.

Wait until the progress state says the dataset is ready before asking a question. The indexing phase may take longer on the first run because the schema embedding model may need to load.

## 3. Select multiple datasets

The dataset selector supports multiple selections.

1. Select one or more datasets in the list.
2. Choose **Use selected**.
3. Wait for indexing to finish.
4. Ask a question that refers to one or more sources.

Each selected file is loaded into its own `dataset_*` table. The agent can use discovered relationships when generating joins. Use clear, consistent column names such as `customer_id`, `order_id`, or `product_id` to improve relationship detection.

## 4. Ask a question

Enter a natural-language question in the query box. Examples:

```text
What is the total revenue?
Show the top 5 customers by revenue.
Compare revenue by country between two uploaded datasets.
Which products had the highest average order value in 2025?
```

You can choose one of the example questions below the input to get started. The agent plans the request, retrieves relevant schema, generates SQL, validates it, executes it, verifies the result, and prepares an answer.

## 5. Understand the result

The result area contains:

- The natural-language answer
- Execution time and retry count
- Tables used by the agent
- The generated SQL
- An editable SQL preview
- The returned rows and columns
- Automatically selected numeric analytics

Use **Copy** to copy SQL. Edit the SQL and choose **Run SQL** to execute the read-only query again. Use **Export CSV** to download returned rows.

The SQL editor still applies the application's read-only and schema validation rules. Write operations, comments, unknown tables or columns, multiple statements, and unrestricted result sets are rejected.

## 6. Query follow-ups

Ask precise questions when possible. Include the metric, time period, grouping, sorting, and limit you need:

```text
Show total revenue by product for January 2025, sorted descending, limited to 10 products.
```

If a requested field does not exist, the agent should explain that the available schema cannot answer the question instead of inventing a column.

## 7. Data quality and relationships

When a file is uploaded, the backend profiles it using row counts, missing values, duplicate records, unique values, numeric ranges, date-like columns, and categorical-column signals. It produces a quality score as guidance, not as a guarantee that the data is correct.

Relationships are inferred from column names, data types, uniqueness, and overlapping values. Inferred relationships are suggestions for query planning. Review the generated SQL before relying on a join for important decisions.

## 8. Troubleshooting

### The upload button is disabled

Wait for the current upload or indexing operation to finish. Refresh the dataset list after the backend is ready.

### Indexing appears slow

The first indexing run can take several minutes while the embedding model loads. Keep the page open and wait until the status reaches ready. Check the backend logs for `Ingested ... schema documents.`.

### The frontend shows `Failed to fetch`

Open the backend health URL and confirm that `NEXT_PUBLIC_API_URL` points to the backend. For deployed environments, verify the backend CORS origin includes the exact frontend URL.

### A file is rejected

Confirm that the extension is supported and that the file contains readable tabular data. Excel files need the Excel parser dependencies; Parquet files need `pyarrow`; YAML files need `PyYAML`.

### A query cannot answer the question

Check the schema and the active dataset names. Use the exact column meaning in the question. For joins, make sure the datasets share stable identifiers such as customer or order IDs.

## 9. Good practices

- Use descriptive filenames and stable column names.
- Avoid duplicate column names inside one file.
- Keep identifiers consistent across datasets.
- Select only the datasets needed for the current question.
- Review SQL before using results for important decisions.
- Do not upload credentials, secrets, or sensitive files unless the deployment has the required access controls and storage protections.
