import random
import json
from flask import Flask, render_template, request, jsonify
from database import init_db, clear_operations, insert_operation, get_latest_operation, get_all_operations, get_operation_by_id

app = Flask(__name__)

app.config['BANKER_ENABLED'] = True

def safety_check(available, allocation, need):
    n = len(allocation)
    m = len(available)
    work = available[:]
    finish = [False] * n
    seq = []
    
    while True:
        found = False
        for i in range(n):
            if not finish[i] and all(need[i][j] <= work[j] for j in range(m)):
                work = [work[j] + allocation[i][j] for j in range(m)]
                finish[i] = True
                seq.append(i)
                found = True
        if not found:
            break
    
    return all(finish), seq

def detect_deadlock(available, allocation, need):
    n = len(allocation)
    m = len(available)
    work = available[:]
    finish = [False] * n
    
    while True:
        found = False
        for i in range(n):
            if not finish[i] and all(need[i][j] <= work[j] for j in range(m)):
                work = [work[j] + allocation[i][j] for j in range(m)]
                finish[i] = True
                found = True
        if not found:
            break
    
    deadlocked = [i for i in range(n) if not finish[i]]
    return deadlocked

def generate_safe_max_matrix(process_count, resource_count, total_resources):
    max_attempts = 1000
    for _ in range(max_attempts):
        max_matrix = []
        for _ in range(process_count):
            row = []
            for j in range(resource_count):
                row.append(random.randint(1, total_resources[j]))
            max_matrix.append(row)
        
        allocation = [[0] * resource_count for _ in range(process_count)]
        need = [max_matrix[i][:] for i in range(process_count)]
        
        is_safe, _ = safety_check(total_resources[:], allocation, need)
        if is_safe:
            return max_matrix
    
    return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/init', methods=['POST'])
def api_init():
    try:
        data = request.get_json()
        resource_count = data.get('resource_count', 3)
        total_resources = data.get('total_resources', [10, 5, 7])
        process_count = data.get('process_count', 5)
        max_matrix = data.get('max_matrix', [])
        
        if not max_matrix:
            max_matrix = generate_safe_max_matrix(process_count, resource_count, total_resources)
            if not max_matrix:
                return jsonify({'success': False, 'message': '无法生成安全的最大需求矩阵'})
        
        allocation = [[0] * resource_count for _ in range(process_count)]
        need = [max_matrix[i][:] for i in range(process_count)]
        available = total_resources[:]
        
        is_safe, safe_seq = safety_check(available[:], allocation, need)
        
        clear_operations()
        insert_operation(
            op_type='init',
            description=f'系统初始化：{process_count}个进程，{resource_count}种资源，总量{total_resources}',
            available=available,
            allocation=allocation,
            max_matrix=max_matrix,
            need=need,
            safe_seq=safe_seq,
            is_deadlock=0
        )
        
        return jsonify({
            'success': True,
            'banker_enabled': app.config['BANKER_ENABLED'],
            'state': {
                'available': available,
                'allocation': allocation,
                'need': need,
                'max': max_matrix,
                'safe_seq': safe_seq,
                'is_deadlock': False
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/state', methods=['GET'])
def api_state():
    try:
        latest = get_latest_operation()
        if not latest:
            return jsonify({'success': False, 'message': '系统未初始化'})
        
        deadlocked = detect_deadlock(latest['available'][:], latest['allocation'], latest['need'])
        
        return jsonify({
            'available': latest['available'],
            'allocation': latest['allocation'],
            'need': latest['need'],
            'max': latest['max'],
            'safe_seq': latest['safe_seq'],
            'is_deadlock': bool(latest['is_deadlock']),
            'deadlocked_processes': deadlocked,
            'banker_enabled': app.config['BANKER_ENABLED']
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/request', methods=['POST'])
def api_request():
    try:
        data = request.get_json()
        process = data.get('process')
        request_vec = data.get('request', [])
        
        latest = get_latest_operation()
        if not latest:
            return jsonify({'success': False, 'message': '系统未初始化'})
        
        available = latest['available'][:]
        allocation = [row[:] for row in latest['allocation']]
        need = [row[:] for row in latest['need']]
        max_matrix = latest['max']
        
        n = len(allocation)
        m = len(available)
        
        if process < 0 or process >= n:
            return jsonify({'success': False, 'message': '无效的进程编号'})
        
        if len(request_vec) != m:
            return jsonify({'success': False, 'message': '请求向量长度不正确'})
        
        for j in range(m):
            if request_vec[j] < 0:
                return jsonify({'success': False, 'message': '请求资源数不能为负数'})
            if request_vec[j] > need[process][j]:
                return jsonify({'success': False, 'message': '请求资源超过进程需求'})
            if request_vec[j] > available[j]:
                return jsonify({'success': False, 'message': '请求资源超过可用资源'})
        
        if app.config['BANKER_ENABLED']:
            temp_available = [available[j] - request_vec[j] for j in range(m)]
            temp_allocation = [row[:] for row in allocation]
            temp_need = [row[:] for row in need]
            temp_allocation[process] = [temp_allocation[process][j] + request_vec[j] for j in range(m)]
            temp_need[process] = [temp_need[process][j] - request_vec[j] for j in range(m)]
            
            is_safe, safe_seq = safety_check(temp_available[:], temp_allocation, temp_need)
            
            if not is_safe:
                insert_operation(
                    op_type='request_denied',
                    description=f'进程P{process}请求资源{request_vec}被拒绝（不安全）',
                    available=available,
                    allocation=allocation,
                    max_matrix=max_matrix,
                    need=need,
                    safe_seq=None,
                    is_deadlock=0
                )
                return jsonify({
                    'success': False,
                    'message': '请求被拒绝：系统将进入不安全状态',
                    'state': {
                        'available': available,
                        'allocation': allocation,
                        'need': need,
                        'max': max_matrix,
                        'safe_seq': None,
                        'is_deadlock': False
                    }
                })
            
            available = temp_available
            allocation = temp_allocation
            need = temp_need
            
            is_safe, safe_seq = safety_check(available[:], allocation, need)
            
            insert_operation(
                op_type='request_success',
                description=f'进程P{process}请求资源{request_vec}成功',
                available=available,
                allocation=allocation,
                max_matrix=max_matrix,
                need=need,
                safe_seq=safe_seq,
                is_deadlock=0
            )
            
            return jsonify({
                'success': True,
                'message': '请求成功',
                'state': {
                    'available': available,
                    'allocation': allocation,
                    'need': need,
                    'max': max_matrix,
                    'safe_seq': safe_seq,
                    'is_deadlock': False
                }
            })
        else:
            available = [available[j] - request_vec[j] for j in range(m)]
            allocation[process] = [allocation[process][j] + request_vec[j] for j in range(m)]
            need[process] = [need[process][j] - request_vec[j] for j in range(m)]
            
            is_safe, safe_seq = safety_check(available[:], allocation, need)
            deadlocked = detect_deadlock(available[:], allocation, need)
            
            insert_operation(
                op_type='request_success',
                description=f'进程P{process}请求资源{request_vec}（跳过银行家算法）',
                available=available,
                allocation=allocation,
                max_matrix=max_matrix,
                need=need,
                safe_seq=safe_seq if is_safe else None,
                is_deadlock=1 if len(deadlocked) > 0 else 0
            )
            
            return jsonify({
                'success': True,
                'message': '请求已分配（未进行安全性检查）',
                'state': {
                    'available': available,
                    'allocation': allocation,
                    'need': need,
                    'max': max_matrix,
                    'safe_seq': safe_seq if is_safe else None,
                    'is_deadlock': len(deadlocked) > 0,
                    'deadlocked_processes': deadlocked
                }
            })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/release', methods=['POST'])
def api_release():
    try:
        data = request.get_json()
        process = data.get('process')
        
        latest = get_latest_operation()
        if not latest:
            return jsonify({'success': False, 'message': '系统未初始化'})
        
        available = latest['available'][:]
        allocation = [row[:] for row in latest['allocation']]
        need = [row[:] for row in latest['need']]
        max_matrix = latest['max']
        
        n = len(allocation)
        
        if process < 0 or process >= n:
            return jsonify({'success': False, 'message': '无效的进程编号'})
        
        released = allocation[process][:]
        available = [available[j] + released[j] for j in range(len(available))]
        allocation[process] = [0] * len(available)
        need[process] = max_matrix[process][:]
        
        is_safe, safe_seq = safety_check(available[:], allocation, need)
        
        insert_operation(
            op_type='release',
            description=f'进程P{process}释放资源{released}',
            available=available,
            allocation=allocation,
            max_matrix=max_matrix,
            need=need,
            safe_seq=safe_seq,
            is_deadlock=0
        )
        
        return jsonify({
            'success': True,
            'message': '资源释放成功',
            'state': {
                'available': available,
                'allocation': allocation,
                'need': need,
                'max': max_matrix,
                'safe_seq': safe_seq,
                'is_deadlock': False
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/detect', methods=['POST'])
def api_detect():
    try:
        latest = get_latest_operation()
        if not latest:
            return jsonify({'success': False, 'message': '系统未初始化'})
        
        available = latest['available'][:]
        allocation = [row[:] for row in latest['allocation']]
        need = [row[:] for row in latest['need']]
        max_matrix = latest['max']
        
        deadlocked = detect_deadlock(available[:], allocation, need)
        
        insert_operation(
            op_type='deadlock_detect',
            description=f'死锁检测：{"检测到死锁进程" + str(deadlocked) if deadlocked else "未检测到死锁"}',
            available=available,
            allocation=allocation,
            max_matrix=max_matrix,
            need=need,
            safe_seq=None,
            is_deadlock=1 if len(deadlocked) > 0 else 0
        )
        
        return jsonify({
            'success': True,
            'deadlocked_processes': deadlocked,
            'state': {
                'available': available,
                'allocation': allocation,
                'need': need,
                'max': max_matrix,
                'safe_seq': None,
                'is_deadlock': len(deadlocked) > 0,
                'deadlocked_processes': deadlocked
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/toggle_algorithm', methods=['POST'])
def api_toggle_algorithm():
    try:
        data = request.get_json()
        enable = data.get('enable', True)
        app.config['BANKER_ENABLED'] = enable
        return jsonify({'success': True, 'banker_enabled': enable})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/history', methods=['GET'])
def api_history():
    try:
        operations = get_all_operations()
        return jsonify({'operations': operations})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/snapshot', methods=['GET'])
def api_snapshot():
    try:
        op_id = request.args.get('op_id', type=int)
        operation = get_operation_by_id(op_id)
        if not operation:
            return jsonify({'success': False, 'message': '操作记录不存在'})
        
        deadlocked = detect_deadlock(operation['available'][:], operation['allocation'], operation['need'])
        
        return jsonify({
            'op_id': operation['id'],
            'state': {
                'available': operation['available'],
                'allocation': operation['allocation'],
                'need': operation['need'],
                'max': operation['max'],
                'safe_seq': operation['safe_seq'],
                'is_deadlock': bool(operation['is_deadlock']),
                'deadlocked_processes': deadlocked
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/random_run', methods=['POST'])
def api_random_run():
    try:
        data = request.get_json()
        max_steps = data.get('max_steps', 100)
        
        resource_count = 3
        total_resources = [10, 5, 7]
        process_count = 5
        
        max_matrix = generate_safe_max_matrix(process_count, resource_count, total_resources)
        if not max_matrix:
            return jsonify({'success': False, 'message': '无法生成安全的最大需求矩阵'})
        
        allocation = [[0] * resource_count for _ in range(process_count)]
        need = [max_matrix[i][:] for i in range(process_count)]
        available = total_resources[:]
        
        is_safe, safe_seq = safety_check(available[:], allocation, need)
        
        clear_operations()
        insert_operation(
            op_type='init',
            description=f'死锁实验初始化：{process_count}个进程，{resource_count}种资源',
            available=available,
            allocation=allocation,
            max_matrix=max_matrix,
            need=need,
            safe_seq=safe_seq,
            is_deadlock=0
        )
        
        old_banker_state = app.config['BANKER_ENABLED']
        app.config['BANKER_ENABLED'] = False
        
        operations_added = 1
        deadlock_achieved = False
        
        for step in range(max_steps):
            latest = get_latest_operation()
            if not latest:
                break
            
            available = latest['available'][:]
            allocation = [row[:] for row in latest['allocation']]
            need = [row[:] for row in latest['need']]
            max_matrix = latest['max']
            
            deadlocked = detect_deadlock(available[:], allocation, need)
            if len(deadlocked) > 0:
                deadlock_achieved = True
                break
            
            process = random.randint(0, process_count - 1)
            
            request_vec = []
            for j in range(resource_count):
                max_req = min(need[process][j], available[j])
                request_vec.append(random.randint(0, max_req) if max_req > 0 else 0)
            
            if all(r == 0 for r in request_vec):
                continue
            
            for j in range(resource_count):
                if request_vec[j] > need[process][j]:
                    request_vec[j] = need[process][j]
                if request_vec[j] > available[j]:
                    request_vec[j] = available[j]
            
            if all(r == 0 for r in request_vec):
                continue
            
            available = [available[j] - request_vec[j] for j in range(resource_count)]
            allocation[process] = [allocation[process][j] + request_vec[j] for j in range(resource_count)]
            need[process] = [need[process][j] - request_vec[j] for j in range(resource_count)]
            
            is_safe, safe_seq = safety_check(available[:], allocation, need)
            deadlocked = detect_deadlock(available[:], allocation, need)
            
            insert_operation(
                op_type='request_success',
                description=f'[随机实验]进程P{process}请求资源{request_vec}',
                available=available,
                allocation=allocation,
                max_matrix=max_matrix,
                need=need,
                safe_seq=safe_seq if is_safe else None,
                is_deadlock=1 if len(deadlocked) > 0 else 0
            )
            
            operations_added += 1
            
            if len(deadlocked) > 0:
                deadlock_achieved = True
                break
        
        app.config['BANKER_ENABLED'] = old_banker_state
        
        latest = get_latest_operation()
        deadlocked = []
        if latest:
            deadlocked = detect_deadlock(latest['available'][:], latest['allocation'], latest['need'])
        
        return jsonify({
            'success': True,
            'deadlock_achieved': deadlock_achieved,
            'operations_added': operations_added,
            'deadlocked_processes': deadlocked,
            'message': f'实验结束：{"检测到死锁" if deadlock_achieved else "达到最大步数"}'
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=5000, debug=True)