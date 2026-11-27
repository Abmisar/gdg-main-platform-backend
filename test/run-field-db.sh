set -eu
check_memory() {
  sysctl vm.swapusage
  memory_pressure -Q
  sysctl -n vm.swapusage | awk '{for(i=1;i<=NF;i++) if($i=="used") {v=$(i+2); sub(/M$/,"",v); exit !(v*1048576 <= 10500000000)}}'
  memory_pressure -Q | awk '/free percentage/ {exit !($NF+0 >= 25)}'
}
check_memory
trap 'colima stop --profile gdg-field-test' EXIT
colima start --profile gdg-field-test --cpu 2 --memory 3
check_memory
node test/field-encryption-db.mjs
