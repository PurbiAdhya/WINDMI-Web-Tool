"""
Split a large OMNI CSV file into one CSV per year for the WINDMI GitHub Pages app.

Usage:
    python tools/split_omni_by_year.py OMNI_HRO_1MIN_2000-2010.csv data

The script writes files like:
    data/omni_2000.csv
    data/omni_2001.csv
    ...

It reads in chunks so it can handle large OMNI files.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


def normalize_header(name: str) -> str:
    return "".join(ch.lower() for ch in str(name) if ch.isalnum())


def find_time_column(columns: list[str]) -> str:
    normalized = [(col, normalize_header(col)) for col in columns]
    for col, norm in normalized:
        if "epoch" in norm:
            return col
    for col, norm in normalized:
        if "dateutc" in norm or "datetime" in norm or norm == "time":
            return col
    raise ValueError(
        "Could not identify the time column. Expected a column containing EPOCH, TIME, or DATE_UTC."
    )


def split_omni_by_year(input_file: Path, output_dir: Path, chunksize: int = 200_000) -> None:
    if not input_file.exists():
        raise FileNotFoundError(f"Input file not found: {input_file}")

    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Reading: {input_file}")
    print(f"Writing yearly files to: {output_dir}")

    first_chunk = True
    time_col = None
    total_rows = 0
    years_written: set[int] = set()

    for chunk_number, chunk in enumerate(pd.read_csv(input_file, chunksize=chunksize), start=1):
        if first_chunk:
            time_col = find_time_column(list(chunk.columns))
            print(f"Detected time column: {time_col}")
            first_chunk = False

        assert time_col is not None

        chunk[time_col] = pd.to_datetime(chunk[time_col], errors="coerce", utc=True)
        chunk = chunk.dropna(subset=[time_col])
        chunk["__year"] = chunk[time_col].dt.year

        for year, group in chunk.groupby("__year"):
            year = int(year)
            output_file = output_dir / f"omni_{year}.csv"
            group = group.drop(columns=["__year"])
            group.to_csv(output_file, mode="a", index=False, header=not output_file.exists())
            years_written.add(year)

        total_rows += len(chunk)
        print(f"Chunk {chunk_number}: processed {total_rows:,} rows", end="\r")

    print("\nDone.")
    if years_written:
        print("Years written:", ", ".join(str(year) for year in sorted(years_written)))
    else:
        print("No valid rows were written. Check the input file and time column.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Split OMNI CSV data into yearly CSV files.")
    parser.add_argument("input_file", type=Path, help="Path to the large OMNI CSV file")
    parser.add_argument(
        "output_dir",
        type=Path,
        nargs="?",
        default=Path("data"),
        help="Output folder for yearly CSV files, default: data",
    )
    parser.add_argument(
        "--chunksize",
        type=int,
        default=200_000,
        help="Rows per pandas chunk, default: 200000",
    )
    args = parser.parse_args()
    split_omni_by_year(args.input_file, args.output_dir, chunksize=args.chunksize)


if __name__ == "__main__":
    main()
