sed 's/<[^>]*>/ /g' input.html | grep -oE '\b[0-9]+\b' | sort -n | uniq -c | sort -nr > output.txt
